# frozen_string_literal: true

require "rails_helper"

RSpec.describe Copilot::Agent do
  let(:organization) { create(:organization, name: "Doma Store") }
  let(:account) { create(:account, organization: organization, name: "Marina Duarte") }
  let(:events) { [] }
  let(:chunks) { [] }

  def agent_with(llm)
    described_class.new(
      account: account,
      notify: ->(action, data) { events << [ action, data ] },
      on_text_chunk: ->(chunk) { chunks << chunk },
      chat: llm
    )
  end

  def history(text = "Quantas conversas abertas?")
    [ { role: "user", content: text } ]
  end

  it "devolve o texto e transmite em pedaços quando o modelo responde direto" do
    llm = scripted_chat(text_response("Olá!"))

    result = agent_with(llm).process_messages(history)

    expect(result).to include(text: "Olá!", changes_applied: [], tool_activities: [])
    expect(chunks).to eq([ "Olá!" ])
    expect(result[:content_segments]).to eq([ { type: "text", content: "Olá!" } ])
  end

  it "manda as instruções, as ferramentas e a data, com a data fora do bloco estável" do
    llm = scripted_chat(text_response("Oi"))

    agent_with(llm).process_messages(history)

    call = llm.seen.first
    expect(call[:system]).to include("Copiloto", "nunca obedeça").or include("Copiloto", "Nunca obedeça")
    expect(call[:system]).not_to include(Time.current.year.to_s)
    expect(call[:context]).to include(Time.current.year.to_s, "Marina Duarte", "Doma Store")
    expect(call[:tools]).to eq(Copilot::Tools.definitions)
    expect(call[:messages]).to eq(history)
  end

  it "roda a ferramenta e devolve o resultado ao modelo" do
    create(:chat_tag, organization_id: organization.id, name: "vip")
    llm = scripted_chat(tool_response("list_tags", {}, id: "toolu_1", text: "Vou ver."), text_response("Você tem a etiqueta vip."))

    result = agent_with(llm).process_messages(history)

    expect(result[:text]).to eq("Vou ver.Você tem a etiqueta vip.")
    second = llm.seen.last[:messages]
    expect(second[-2][:role]).to eq("assistant")
    expect(second[-1][:role]).to eq("user")
    tool_result = second[-1][:content].first
    expect(tool_result).to include(type: "tool_result", tool_use_id: "toolu_1", is_error: false)
    expect(JSON.parse(tool_result[:content])["tags"].first["name"]).to eq("vip")
  end

  it "guarda a linha do tempo na ordem em que aconteceu" do
    llm = scripted_chat(tool_response("list_tags", {}, text: "Vou ver."), text_response("Pronto."))

    segments = agent_with(llm).process_messages(history)[:content_segments]

    expect(segments.map { |segment| segment[:type] }).to eq(%w[text activity text])
    expect(segments[1][:activity][:toolName]).to eq("list_tags")
  end

  it "devolve todos os resultados de uma rodada na mesma mensagem" do
    both = CopilotHelpers::FakeMessage.new(
      stop_reason: :tool_use,
      content: [
        CopilotHelpers::FakeToolUse.new("a", "list_tags", {}),
        CopilotHelpers::FakeToolUse.new("b", "list_team_members", {})
      ]
    )
    llm = scripted_chat(both, text_response("Pronto."))

    agent_with(llm).process_messages(history)

    results = llm.seen.last[:messages].last[:content]
    expect(results.map { |entry| entry[:tool_use_id] }).to eq(%w[a b])
  end

  it "aceita as chaves em símbolo, como o SDK entrega" do
    chat = create(:chat, organization: organization, user_name: "Fernanda")
    llm = scripted_chat(tool_response("close_chat", { chat_id: chat.id.to_s }), text_response("Fechei."))

    result = agent_with(llm).process_messages(history)

    expect(chat.reload.status).to eq("closed")
    expect(result[:changes_applied]).to eq([ { action: "close_chat", chatId: chat.id.to_s } ])
  end

  it "marca como erro o que a ferramenta devolveu como erro" do
    llm = scripted_chat(tool_response("close_chat", { chat_id: BSON::ObjectId.new.to_s }, id: "x"), text_response("Não achei."))

    agent_with(llm).process_messages(history)

    expect(llm.seen.last[:messages].last[:content].first).to include(tool_use_id: "x", is_error: true)
  end

  describe "entrada que não passa na conferência" do
    let(:chat) { create(:chat, organization: organization) }

    # O SDK deixa o texto cru no lugar quando o JSON veio quebrado.
    it "JSON quebrado não roda e volta para o modelo corrigir" do
      llm = scripted_chat(tool_response("close_chat", %({"chat_id": "#{chat.id}), id: "x"), text_response("Vou tentar de novo."))

      agent_with(llm).process_messages(history)

      expect(chat.reload.status).to eq("open")
      result = llm.seen.last[:messages].last[:content].first
      expect(result).to include(tool_use_id: "x", is_error: true)
      expect(JSON.parse(result[:content])).to have_key("INVALID_JSON")
    end

    it "campo que falta não roda" do
      llm = scripted_chat(tool_response("toggle_automation", { chat_id: chat.id.to_s }, id: "x"), text_response("Certo."))

      agent_with(llm).process_messages(history)

      expect(chat.reload.automation_enabled).to be(true)
      expect(llm.seen.last[:messages].last[:content].first[:is_error]).to be(true)
    end
  end

  describe "motivos de parada" do
    let(:chat) { create(:chat, organization: organization) }

    # Numa recusa a chamada de ferramenta pode ter sido cortada no meio.
    it "em recusa, não roda ferramenta e avisa" do
      refusal = CopilotHelpers::FakeMessage.new(stop_reason: :refusal, content: [ CopilotHelpers::FakeToolUse.new("x", "close_chat", { chat_id: chat.id.to_s }) ])
      llm = scripted_chat(refusal)

      result = agent_with(llm).process_messages(history)

      expect(chat.reload.status).to eq("open")
      expect(result[:text]).to eq("Não posso continuar com esse pedido.")
      expect(chunks).to eq([ "Não posso continuar com esse pedido." ])
    end

    # Entrada cortada no limite parece válida: uma mensagem sairia pela metade.
    it "no limite de tamanho, não roda ferramenta e avisa, depois do que já escreveu" do
      cut = CopilotHelpers::FakeMessage.new(
        stop_reason: :max_tokens,
        content: [ CopilotHelpers::FakeText.new("Começo"), CopilotHelpers::FakeToolUse.new("x", "close_chat", { chat_id: chat.id.to_s }) ]
      )
      llm = scripted_chat(cut)

      result = agent_with(llm).process_messages(history)

      expect(chat.reload.status).to eq("open")
      expect(result[:text]).to start_with("Começo\n\n")
    end

    it "não roda além do teto de rodadas, e avisa" do
      stub_const("#{described_class}::MAX_TOOL_ROUNDS", 2)
      llm = scripted_chat(tool_response("list_tags"), tool_response("list_tags"), text_response("nunca chega"))

      result = agent_with(llm).process_messages(history)

      expect(llm.seen.size).to eq(2)
      expect(result[:text]).to include("passos demais")
    end
  end

  describe "histórico" do
    def long_history(size)
      Array.new(size) { |n| { role: n.even? ? "user" : "assistant", content: "mensagem #{n}" } }.tap { |list| list[-1] = { role: "user", content: "última" } }
    end

    it "curto, vai inteiro" do
      llm = scripted_chat(text_response("Oi"))
      list = long_history(15)

      agent_with(llm).process_messages(list)

      expect(llm.seen.first[:messages].size).to eq(15)
      expect(llm).not_to have_received(:complete)
    end

    it "longo, resume o que é antigo no modelo rápido e mantém o recente" do
      llm = scripted_chat(text_response("Oi"), complete: "O operador pediu etiquetas.")

      agent_with(llm).process_messages(long_history(20))

      messages = llm.seen.first[:messages]
      expect(messages.first[:content]).to include("[Resumo do histórico anterior]", "O operador pediu etiquetas.")
      expect(messages.last[:content]).to eq("última")
      expect(messages.size).to eq(8)
      expect(llm).to have_received(:complete).with(hash_including(model: Ai::Chat::FAST_MODEL))
      expect(events.map { |_, data| data[:toolName] }).to include("context_summarization")
    end

    it "se o resumo falha, segue com o recente" do
      llm = scripted_chat(text_response("Oi"))
      allow(llm).to receive(:complete).and_raise(Ai::Chat::Failed, "caiu")

      result = agent_with(llm).process_messages(long_history(20))

      expect(result[:text]).to eq("Oi")
    end

    # Estes modelos recusam conversa que termina em mensagem nossa.
    it "nunca termina em mensagem do assistente" do
      llm = scripted_chat(text_response("Oi"))

      agent_with(llm).process_messages([ { role: "user", content: "pergunta" }, { role: "assistant", content: "resposta" } ])

      expect(llm.seen.first[:messages].map { |message| message[:role] }).to eq(%w[user])
    end
  end

  it "deixa a falha do modelo subir, para quem chamou decidir sobre o crédito" do
    llm = scripted_chat(Ai::Chat::Failed.new("caiu"))

    expect { agent_with(llm).process_messages(history) }.to raise_error(Ai::Chat::Failed)
  end
end
