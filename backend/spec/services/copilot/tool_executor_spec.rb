# frozen_string_literal: true

require "rails_helper"

RSpec.describe Copilot::ToolExecutor do
  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, name: "Marina Duarte", email: "marina@exemplo.com.br") }
  let(:events) { [] }
  let(:notify) { ->(action, data) { events << [ action, data ] } }
  let(:llm) { scripted_chat(complete: "Resumo da conversa") }
  let(:executor) { described_class.new(account: account, notify: notify, chat: llm) }

  def chat_for(**attributes)
    create(:chat, organization: organization, **attributes)
  end

  def tag_for(name, org = organization)
    create(:chat_tag, organization_id: org.id, name: name)
  end

  def restricted_executor(level = "assigned", **permissions)
    person = member_with(chat: "all", chat_list_to: level, **permissions)
    [ described_class.new(account: person, notify: notify, chat: llm), person ]
  end

  describe "atividades" do
    it "avisa o início e o fim, com o que entrou e o que saiu" do
      executor.execute("list_tags", {})

      expect(events.map { |action, data| [ action, data[:status], data[:toolName] ] }).to eq(
        [ [ "tool_activity", "started", "list_tags" ], [ "tool_activity", "completed", "list_tags" ] ]
      )
      completed = events.last.last
      expect(completed).to include(activityType: "reading", icon: "tag", description: "Listando etiquetas...", success: true)
      expect(completed[:timestamp]).to be_a(Integer)
      expect(completed[:output]).to eq("tags" => [])
      expect(executor.tool_activities.size).to eq(1)
    end

    it "marca a falha da ferramenta" do
      executor.execute("get_chat_details", { "chat_id" => BSON::ObjectId.new.to_s })

      expect(events.last.last[:success]).to be(false)
    end

    it "diz de quem é a conversa" do
      chat = chat_for(user_name: "Fernanda", external_id: "5531971810932")

      executor.execute("get_chat_details", { "chat_id" => chat.id.to_s })

      expect(events.last.last[:contact]).to eq(userName: "Fernanda", phoneNumber: "5531971810932")
    end

    # Com o traço cru, o modelo respondeu que a pessoa "respondeu só -".
    it "mostra o áudio sem transcrição como áudio, na conversa e na lista" do
      chat = chat_for(user_name: "Fernanda Lima")
      ChatMessage::Audio.create!(chat: chat, role: "user", content: "-", audio_url: "https://exemplo.com/a.ogg")

      details = executor.execute("get_chat_details", { "chat_id" => chat.id.to_s })
      list = executor.execute("search_chats", { "query" => "Fernanda" })

      expect(details[:recent_messages].last[:content]).to eq("[áudio sem transcrição]")
      expect(list[:chats].first[:last_message_content]).to eq("[áudio sem transcrição]")
    end

    it "corta o que guarda, porque mora num documento só" do
      chat = chat_for
      create(:chat_text_message, chat: chat, content: "x" * 390)
      long = "y" * 2_000

      executor.execute("search_chats", { "query" => long })

      expect(events.last.last[:input]["query"].length).to be < 1_100
    end

    it "não estoura com ferramenta que não existe" do
      expect(executor.execute("drop_database", {})).to eq(error: "Esta ferramenta não existe.")
    end

    it "não estoura com erro inesperado: devolve erro para o modelo" do
      allow(Chat).to receive(:visible_to).and_raise("banco fora do ar")

      expect(executor.execute("search_chats", {})).to eq(error: "Não foi possível processar a mensagem. Tente de novo.")
    end
  end

  describe "search_chats" do
    it "busca por nome, telefone e última mensagem, sem interpretar regex" do
      by_name = chat_for(user_name: "Fernanda Lima")
      by_phone = chat_for(user_name: "Outro", external_id: "5531971810932")
      by_content = chat_for(user_name: "Terceiro", last_message_content: "Fernanda indicou vocês")
      chat_for(user_name: "Ninguém")

      result = executor.execute("search_chats", { "query" => "fernanda" })
      expect(result[:chats].map { |c| c[:id] }).to contain_exactly(by_name.id.to_s, by_content.id.to_s)

      result = executor.execute("search_chats", { "query" => "97181" })
      expect(result[:chats].map { |c| c[:id] }).to eq([ by_phone.id.to_s ])

      expect(executor.execute("search_chats", { "query" => ".*" })[:total]).to eq(0)
    end

    it "traz os nomes das etiquetas e de quem atende" do
      tag = tag_for("vip")
      chat_for(chat_tag_ids: [ tag.id ], assigned_account_id: account.id)

      summary = executor.execute("search_chats", {})[:chats].first

      expect(summary).to include(tags: [ "vip" ], assigned_name: "Marina Duarte")
    end

    it "filtra por situação e por quem atende" do
      mine = chat_for(assigned_account_id: account.id, status: "closed")
      colleague = create(:account, organization: organization, role: "member", email: "camila@exemplo.com.br")
      theirs = chat_for(assigned_account_id: colleague.id)

      expect(executor.execute("search_chats", { "assigned_to_me" => true })[:chats].map { |c| c[:id] }).to eq([ mine.id.to_s ])
      expect(executor.execute("search_chats", { "status" => "closed" })[:chats].map { |c| c[:id] }).to eq([ mine.id.to_s ])
      expect(executor.execute("search_chats", { "assigned_to_user" => "CAMILA@exemplo.com.br" })[:chats].map { |c| c[:id] }).to eq([ theirs.id.to_s ])
    end

    it "não acha pessoa de outra organização pelo e-mail" do
      create(:account, organization: create(:organization), email: "de-fora@exemplo.com.br")

      expect(executor.execute("search_chats", { "assigned_to_user" => "de-fora@exemplo.com.br" })).to have_key(:error)
    end

    it "filtra por etiquetas, com E e OU" do
      vip = tag_for("vip")
      novo = tag_for("cliente-novo")
      both = chat_for(chat_tag_ids: [ vip.id, novo.id ])
      only_vip = chat_for(chat_tag_ids: [ vip.id ])
      chat_for

      any = executor.execute("search_chats", { "has_tags" => [ "VIP", "Cliente Novo" ] })
      expect(any[:chats].map { |c| c[:id] }).to contain_exactly(both.id.to_s, only_vip.id.to_s)

      all = executor.execute("search_chats", { "has_tags" => %w[vip cliente-novo], "tag_operator" => "and" })
      expect(all[:chats].map { |c| c[:id] }).to eq([ both.id.to_s ])
    end

    # Na origem a etiqueta que não existe era ignorada, e vinham todas como se tivessem.
    it "etiqueta que não existe não casa com ninguém" do
      chat_for

      expect(executor.execute("search_chats", { "has_tag" => "nao-existe" })).to include(total: 0, chats: [])
    end

    it "etiqueta de outra organização não casa" do
      foreign = tag_for("vip", create(:organization))
      chat_for(chat_tag_ids: [ foreign.id ])

      expect(executor.execute("search_chats", { "has_tag" => "vip" })[:total]).to eq(0)
    end

    it "limita a quantidade e diz o total" do
      3.times { chat_for }

      result = executor.execute("search_chats", { "limit" => 2 })

      expect(result).to include(total: 3, returned: 2)
    end

    it "não traz a de teste nem a de outra organização" do
      chat_for(external_id: Chat::TEST_EXTERNAL_ID)
      create(:chat, organization: create(:organization))

      expect(executor.execute("search_chats", {})[:total]).to eq(0)
    end

    it "por id, só acha na própria organização" do
      foreign = create(:chat, organization: create(:organization))

      expect(executor.execute("search_chats", { "chat_id" => foreign.id.to_s })).to have_key(:error)
    end
  end

  # A regra central: o copiloto não enxerga mais do que a pessoa.
  describe "visibilidade por chat_list_to" do
    let(:colleague) { create(:account, organization: organization, role: "member") }
    let!(:theirs) { chat_for(assigned_account_id: colleague.id, user_name: "Conversa dela") }

    it "a busca não traz" do
      restricted, = restricted_executor

      expect(restricted.execute("search_chats", {})[:total]).to eq(0)
      expect(restricted.execute("search_chats", { "chat_id" => theirs.id.to_s })).to have_key(:error)
    end

    it "não lê, resume nem analisa" do
      create(:chat_text_message, chat: theirs)
      restricted, = restricted_executor

      expect(restricted.execute("get_chat_details", { "chat_id" => theirs.id.to_s })).to have_key(:error)
      expect(restricted.execute("summarize_chat", { "chat_id" => theirs.id.to_s })).to have_key(:error)
      expect(restricted.execute("qualify_chats", { "chat_ids" => [ theirs.id.to_s ] })[:chats]).to eq([])
      expect(llm).not_to have_received(:complete)
    end

    it "não muda" do
      tag_for("vip")
      restricted, = restricted_executor

      expect(restricted.execute("assign_tag", { "chat_id" => theirs.id.to_s, "tag_name" => "vip" })).to have_key(:error)
      expect(restricted.execute("close_chat", { "chat_id" => theirs.id.to_s })).to have_key(:error)
      expect(restricted.execute("assign_chat", { "chat_id" => theirs.id.to_s, "assign_to_me" => true })).to have_key(:error)
      expect(restricted.execute("toggle_automation", { "chat_id" => theirs.id.to_s, "enabled" => false })).to have_key(:error)

      expect(theirs.reload).to have_attributes(status: "open", assigned_account_id: colleague.id, automation_enabled: true)
      expect(theirs.chat_tag_ids).to be_empty
    end

    it "não envia" do
      restricted, = restricted_executor

      result = restricted.execute("send_messages", { "messages" => [ { "chat_id" => theirs.id.to_s, "message" => "oi" } ] })

      expect(result).to include(sent: 0, failed: 1)
      expect(ChatMessage::Base.unscoped.where(chat_id: theirs.id).count).to eq(0)
    end

    it "a pesquisa no conteúdo não encontra" do
      create(:chat_text_message, chat: theirs, content: "orçamento do vestido")
      theirs.update(last_message_at: Time.current)
      restricted, = restricted_executor

      expect(restricted.execute("search_message_content", { "query" => "orçamento" })).to include(total_chats: 0)
    end

    it "as contagens também só contam o que ela vê" do
      restricted, = restricted_executor

      expect(restricted.execute("get_tag_distribution", {})[:total_chats]).to eq(0)
      expect(restricted.execute("get_chat_volume", {})[:total_new_chats]).to eq(0)
      expect(restricted.execute("get_hourly_activity", {})[:total_chats]).to eq(0)

      members = restricted.execute("list_team_members", {})[:members]
      expect(members.sum { |member| member[:total_chats_count] }).to eq(0)
    end

    it "as métricas de um colega não contam o que ela não vê" do
      ChatMessage::Text.create!(chat: theirs, role: "assistant", content: "oi", account_id: colleague.id, sender_name: colleague.name)
      restricted, = restricted_executor

      agents = restricted.execute("get_agent_performance", { "user_email" => colleague.email })[:agents]

      expect(agents.first).to include(chats_handled: 0, messages_sent: 0)
    end
  end

  describe "get_chat_details" do
    it "traz a conversa e as últimas mensagens, sem notas nem chamadas de ferramenta" do
      chat = chat_for(user_name: "Fernanda", custom_attributes: { "cidade" => "Curitiba" }, notes: "Ligar amanhã")
      create(:chat_text_message, chat: chat, role: "user", content: "Oi")
      ChatMessage::Text.create!(chat: chat, role: "assistant", content: "Olá", sender_name: "Marina")
      ChatMessage::Text.create!(chat: chat, role: "base", content: "nota")
      ChatMessage::Text.create!(chat: chat, role: "tool", content: "resultado", tool_call_id: "x")

      result = executor.execute("get_chat_details", { "chat_id" => chat.id.to_s })

      expect(result).to include(user_name: "Fernanda", custom_attributes: { "cidade" => "Curitiba" }, notes: "Ligar amanhã")
      expect(result[:recent_messages].map { |m| [ m[:from], m[:content] ] }).to eq([ [ "contato", "Oi" ], [ "atendente", "Olá" ] ])
    end
  end

  describe "summarize_chat" do
    let(:chat) { chat_for(user_name: "Fernanda") }

    it "resume no modelo rápido, com o foco pedido" do
      create(:chat_text_message, chat: chat, content: "Quero o vestido")

      result = executor.execute("summarize_chat", { "chat_id" => chat.id.to_s, "focus_criteria" => "potencial de venda" })

      expect(result).to eq(chat_id: chat.id.to_s, user_name: "Fernanda", summary: "Resumo da conversa")
      expect(llm).to have_received(:complete).with(
        hash_including(model: Ai::Chat::FAST_MODEL, system: a_string_including("potencial de venda"), prompt: a_string_including("CLIENTE: Quero o vestido"))
      )
    end

    it "avisa quando não há mensagens, sem chamar o modelo" do
      expect(executor.execute("summarize_chat", { "chat_id" => chat.id.to_s })).to eq(error: "Esta conversa ainda não tem mensagens.")
      expect(llm).not_to have_received(:complete)
    end

    it "devolve erro quando o modelo falha" do
      create(:chat_text_message, chat: chat)
      allow(llm).to receive(:complete).and_raise(Ai::Chat::Failed, "caiu")

      expect(executor.execute("summarize_chat", { "chat_id" => chat.id.to_s })).to eq(error: "Não foi possível resumir agora.")
    end
  end

  describe "etiquetas" do
    let(:chat) { chat_for }

    it "lista as da organização" do
      tag_for("vip")
      tag_for("de-fora", create(:organization))

      expect(executor.execute("list_tags", {})[:tags].map { |t| t[:name] }).to eq(%w[vip])
    end

    it "aplica, criando se preciso, e registra a mudança uma vez só" do
      2.times { executor.execute("assign_tag", { "chat_id" => chat.id.to_s, "tag_name" => "Cliente VIP" }) }

      tag = ChatTag.where(organization_id: organization.id, name: "cliente-vip").take
      expect(chat.reload.chat_tag_ids).to eq([ tag.id ])
      expect(executor.changes_applied).to eq([ { action: "assign_tag", chatId: chat.id.to_s, tag: "cliente-vip" } ])
    end

    it "transmite para a lista" do
      chat
      stream = ApplicationCable::Channel.organization_stream(organization.id, "chat-list")

      expect {
        executor.execute("assign_tag", { "chat_id" => chat.id.to_s, "tag_name" => "vip" })
      }.to have_broadcasted_to(stream)
    end

    it "remove" do
      tag = tag_for("vip")
      chat.add_to_set(chat_tag_ids: tag.id)

      expect(executor.execute("remove_tag", { "chat_id" => chat.id.to_s, "tag_name" => "VIP" })).to include(success: true)
      expect(chat.reload.chat_tag_ids).to be_empty
    end

    it "avisa quando a etiqueta não existe" do
      expect(executor.execute("remove_tag", { "chat_id" => chat.id.to_s, "tag_name" => "nada" })).to eq(error: "Etiqueta não encontrada.")
    end

    it "não remove etiqueta pelo nome de outra organização" do
      tag_for("vip", create(:organization))

      expect(executor.execute("remove_tag", { "chat_id" => chat.id.to_s, "tag_name" => "vip" })).to have_key(:error)
    end
  end

  describe "assign_chat" do
    let(:chat) { chat_for }
    let!(:attendant) { create(:account, organization: organization, role: "member", email: "camila@exemplo.com.br", name: "Camila") }

    it "atribui a quem pediu, com a nota dizendo quem foi" do
      result = executor.execute("assign_chat", { "chat_id" => chat.id.to_s, "assign_to_me" => true })

      expect(result).to include(success: true, assigned_account_id: account.id)
      note = ChatMessage::Base.unscoped.where(chat_id: chat.id, role_base_type: "assigned-user-notation").take
      expect(note.content).to include("Marina Duarte")
    end

    it "atribui a um colega pelo e-mail" do
      executor.execute("assign_chat", { "chat_id" => chat.id.to_s, "user_email" => "CAMILA@exemplo.com.br" })

      expect(chat.reload.assigned_account_id).to eq(attendant.id)
    end

    it "tira a atribuição" do
      chat.update(assigned_account_id: attendant.id)

      executor.execute("assign_chat", { "chat_id" => chat.id.to_s })

      expect(chat.reload.assigned_account_id).to be_nil
    end

    it "não atribui a quem está em setupOnly" do
      attendant.update!(setup_only: true)

      expect(executor.execute("assign_chat", { "chat_id" => chat.id.to_s, "user_email" => attendant.email })).to have_key(:error)
      expect(chat.reload.assigned_account_id).to be_nil
    end

    it "não atribui quem pediu, se estiver em setupOnly" do
      account.update!(setup_only: true)

      expect(executor.execute("assign_chat", { "chat_id" => chat.id.to_s, "assign_to_me" => true })).to have_key(:error)
    end

    it "não atribui a pessoa de outra organização" do
      foreign = create(:account, organization: create(:organization), email: "de-fora@exemplo.com.br")

      expect(executor.execute("assign_chat", { "chat_id" => chat.id.to_s, "user_email" => foreign.email })).to have_key(:error)
    end
  end

  describe "toggle_automation e close_chat" do
    let(:chat) { chat_for(automation_enabled: true, active_job_id: "token", automation_resume_at: 1.hour.from_now) }

    it "muda a automação, invalida o religamento agendado e registra quem foi" do
      executor.execute("toggle_automation", { "chat_id" => chat.id.to_s, "enabled" => false })

      expect(chat.reload).to have_attributes(automation_enabled: false, active_job_id: nil, automation_resume_at: nil)
      note = ChatMessage::Base.unscoped.where(chat_id: chat.id, role_base_type: "automation-toggle-notation").take
      expect(note.content).to include("Marina Duarte")
      expect(executor.changes_applied).to eq([ { action: "toggle_automation", chatId: chat.id.to_s, enabled: false } ])
    end

    it "fecha" do
      executor.execute("close_chat", { "chat_id" => chat.id.to_s })

      expect(chat.reload.status).to eq("closed")
    end
  end

  describe "send_messages" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization) }
    let(:chat) { chat_for(connector: connector, user_name: "Fernanda", external_id: "5531971810932") }
    let(:send_url) { "http://evolution.test/message/sendText/#{connector.instance_name}" }

    before { allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep) }

    it "envia em nome de quem pediu, e o histórico diz quem foi" do
      stub_request(:post, send_url).to_return(json_reply({ key: { id: "EVO-1" } }, status: 201))

      result = executor.execute("send_messages", { "messages" => [ { "chat_id" => chat.id.to_s, "message" => "Oi, Fernanda!" } ] })

      expect(result).to include(total: 1, sent: 1, failed: 0)
      message = ChatMessage::Base.unscoped.where(chat_id: chat.id, role: "assistant").take
      expect(message).to have_attributes(content: "Oi, Fernanda!", sender_name: "Marina Duarte", account_id: account.id, message_origin: "frontend")
      expect(executor.changes_applied).to eq([ { action: "send_message", chatId: chat.id.to_s, messagePreview: "Oi, Fernanda!" } ])
    end

    it "avisa por destinatário, na atividade" do
      stub_request(:post, send_url).to_return(json_reply({ key: { id: "EVO-1" } }, status: 201))

      executor.execute("send_messages", { "messages" => [ { "chat_id" => chat.id.to_s, "message" => "Oi" } ] })

      descriptions = events.map { |_, data| data[:description] }
      expect(descriptions).to include("Enviando mensagem para Fernanda...")
    end

    it "conta como falha o que o canal recusou, e não diz que enviou" do
      stub_request(:post, send_url).to_return(status: 500, body: "caiu")

      result = executor.execute("send_messages", { "messages" => [ { "chat_id" => chat.id.to_s, "message" => "Oi" } ] })

      expect(result).to include(sent: 0, failed: 1)
      expect(result[:results].first[:error]).to be_present
      expect(executor.changes_applied).to be_empty
    end

    # A recusa da Meta não levanta: vem na mensagem.
    it "conta como falha a recusa que não levanta exceção" do
      message = instance_double(ChatMessage::Text, status: "failed", status_message: "Fora da janela de 24 horas")
      allow_any_instance_of(Chat).to receive(:send_text_message).and_return(message)

      result = executor.execute("send_messages", { "messages" => [ { "chat_id" => chat.id.to_s, "message" => "Oi" } ] })

      expect(result[:results].first).to include(success: false, error: "Fora da janela de 24 horas")
    end

    it "recusa acima do teto, sem enviar nada" do
      stub_const("#{described_class}::MAX_SEND_MESSAGES", 1)

      result = executor.execute("send_messages", { "messages" => Array.new(2) { { "chat_id" => chat.id.to_s, "message" => "Oi" } } })

      expect(result).to have_key(:error)
      expect(ChatMessage::Base.unscoped.where(chat_id: chat.id).count).to eq(0)
    end

    it "não envia para conversa de outra organização" do
      foreign = create(:chat, organization: create(:organization))

      result = executor.execute("send_messages", { "messages" => [ { "chat_id" => foreign.id.to_s, "message" => "Oi" } ] })

      expect(result).to include(sent: 0, failed: 1)
      expect(ChatMessage::Base.unscoped.where(chat_id: foreign.id).count).to eq(0)
    end

    it "responde erro sem mensagens" do
      expect(executor.execute("send_messages", { "messages" => [] })).to have_key(:error)
    end
  end

  describe "find_hot_leads e qualify_chats" do
    let(:analysis) { { qualification_score: 9, qualification: "quente", reason: "Pediu o pix", is_test: false, key_signals: [ "pediu o pix" ], recommended_action: "Enviar o pix" }.to_json }

    before { allow(llm).to receive(:complete).and_return(analysis) }

    it "acha os contatos, com as duas notas" do
      hot = chat_for(user_name: "Fernanda", last_message_at: 1.hour.ago, unread_messages: 2)
      create(:chat_text_message, chat: hot, content: "Me passa o pix")

      result = executor.execute("find_hot_leads", { "limit" => 3, "user_question" => "quem vai fechar?" })

      lead = result[:leads].first
      expect(lead).to include(chat_id: hot.id.to_s, qualification: "quente", qualification_score: 9, reason: "Pediu o pix")
      expect(lead[:combined_score]).to be > lead[:activity_score] * 0.4
      expect(llm).to have_received(:complete).with(hash_including(prompt: a_string_including("quem vai fechar?")))
    end

    it "deixa de fora fechada, antiga e de teste" do
      closed = chat_for(status: "closed")
      old = chat_for
      create(:chat_text_message, chat: closed)
      create(:chat_text_message, chat: old)
      old.set(last_message_at: 30.days.ago)

      expect(executor.execute("find_hot_leads", {})[:leads]).to be_empty
    end

    it "tira quem a análise desqualifica" do
      chat = chat_for
      create(:chat_text_message, chat: chat, content: "teste")
      allow(llm).to receive(:complete).and_return({ qualification_score: 1, qualification: "nao_qualificado", reason: "Teste", is_test: true }.to_json)

      result = executor.execute("find_hot_leads", {})

      expect(result).to include(qualified_count: 0, total_candidates: 1, leads: [])
    end

    it "qualifica as pedidas" do
      chat = chat_for
      create(:chat_text_message, chat: chat, content: "Me passa o pix")

      result = executor.execute("qualify_chats", { "chat_ids" => [ chat.id.to_s ], "analysis_context" => "general_analysis" })

      expect(result[:chats].first).to include(chat_id: chat.id.to_s, qualification: "quente")
      expect(executor.tool_activities.map { |activity| activity[:toolName] }).to include("analyze_chat", "qualify_chats")
    end

    it "responde erro sem ids" do
      expect(executor.execute("qualify_chats", { "chat_ids" => [] })).to have_key(:error)
    end
  end

  describe "search_message_content" do
    it "agrupa por conversa, com os termos separados por vírgula, sem interpretar regex" do
      chat = chat_for(user_name: "Fernanda")
      create(:chat_text_message, chat: chat, content: "Qual o ORÇAMENTO?")
      create(:chat_text_message, chat: chat, content: "E o preço (à vista)?")
      other = chat_for(user_name: "Roberto")
      create(:chat_text_message, chat: other, content: "Bom dia")

      result = executor.execute("search_message_content", { "query" => "orçamento, preço (à vista)" })

      expect(result).to include(total_chats: 1, total_matches: 2)
      expect(result[:chats].first).to include(chat_id: chat.id.to_s, match_count: 2)
      expect(result[:terms_searched]).to eq([ "orçamento", "preço (à vista)" ])
    end

    it "respeita o período" do
      chat = chat_for
      old = create(:chat_text_message, chat: chat, content: "orçamento antigo")
      old.set(created_at: 90.days.ago)

      expect(executor.execute("search_message_content", { "query" => "orçamento" })[:total_chats]).to eq(0)
    end

    it "não acha nada de outra organização" do
      foreign = create(:chat, organization: create(:organization))
      create(:chat_text_message, chat: foreign, content: "orçamento")

      expect(executor.execute("search_message_content", { "query" => "orçamento" })[:total_chats]).to eq(0)
    end

    it "responde erro sem texto" do
      expect(executor.execute("search_message_content", { "query" => " " })).to have_key(:error)
    end
  end

  describe "time" do
    let!(:attendant) { create(:account, organization: organization, role: "member", name: "Camila", email: "camila@exemplo.com.br") }

    it "lista quem atende, com os departamentos e as conversas" do
      team = create(:team, organization: organization, name: "Comercial")
      create(:team_membership, team: team, account: attendant)
      chat_for(assigned_account_id: attendant.id, status: "open")
      chat_for(assigned_account_id: attendant.id, status: "closed")
      create(:account, organization: organization, role: "member").revoke!
      create(:account, organization: create(:organization))
      account

      result = executor.execute("list_team_members", {})

      expect(result[:total]).to eq(2)
      member = result[:members].find { |entry| entry[:email] == "camila@exemplo.com.br" }
      expect(member).to include(teams: [ "Comercial" ], active_chats_count: 1, total_chats_count: 2, takes_chats: true)
    end

    it "mede o desempenho pelas mensagens da pessoa" do
      chat = chat_for(assigned_account_id: attendant.id, status: "closed", last_message_at: 1.minute.ago)
      question = create(:chat_text_message, chat: chat, role: "user", created_at: 10.minutes.ago)
      ChatMessage::Text.create!(chat: chat, role: "assistant", content: "Oi", account_id: attendant.id, sender_name: "Camila", created_at: question.created_at + 4.minutes)

      agent = executor.execute("get_agent_performance", { "user_email" => attendant.email })[:agents].first

      expect(agent).to include(name: "Camila", chats_handled: 1, messages_sent: 1, chats_closed: 1, avg_response_time_minutes: 4.0)
    end

    it "sem e-mail, traz todos" do
      account

      expect(executor.execute("get_agent_performance", {})[:agents].map { |entry| entry[:name] }).to contain_exactly("Camila", "Marina Duarte")
    end

    it "avisa quando a pessoa não existe na organização" do
      expect(executor.execute("get_agent_performance", { "user_email" => "ninguem@exemplo.com.br" })).to have_key(:error)
    end

    it "monta o ranking, sem quem não atendeu, com a nota de 0 a 100" do
      account
      chat = chat_for(assigned_account_id: attendant.id, status: "closed", last_message_at: 1.minute.ago)
      question = create(:chat_text_message, chat: chat, role: "user", created_at: 10.minutes.ago)
      ChatMessage::Text.create!(chat: chat, role: "assistant", content: "Oi", account_id: attendant.id, created_at: question.created_at + 2.minutes)

      result = executor.execute("get_team_ranking", {})

      expect(result[:total_agents]).to eq(1)
      expect(result[:ranking].first).to include(name: "Camila", position: 1)
      # 30 do tempo de resposta + 0,5 do volume + 1 de fechada, sobre 70.
      expect(result[:ranking].first[:performance_score]).to eq(45.0)
    end
  end

  describe "números" do
    it "distribui por etiqueta, com percentual" do
      vip = tag_for("vip")
      tag_for("sem-uso")
      chat_for(chat_tag_ids: [ vip.id ])
      chat_for

      result = executor.execute("get_tag_distribution", {})

      expect(result).to include(total_chats: 2, total_tagged: 1, total_untagged: 1)
      expect(result[:tags].first).to include(name: "vip", chat_count: 1, percentage: 50.0)
    end

    it "conta o volume por dia, no fuso da organização" do
      zone = ActiveSupport::TimeZone["America/Sao_Paulo"]
      chat = chat_for
      # 23h30 em São Paulo já é o dia seguinte em UTC.
      chat.set(created_at: zone.parse("2026-11-03 23:30"), last_message_at: zone.parse("2026-11-03 23:30"))

      result = executor.execute("get_chat_volume", { "date_from" => "2026-11-03", "date_to" => "2026-11-03" })

      expect(result[:daily_new]).to eq([ { date: "2026-11-03", new_chats: 1 } ])
      expect(result[:daily_active]).to eq([ { date: "2026-11-03", active_chats: 1 } ])
      expect(result[:total_new_chats]).to eq(1)
    end

    it "acha os horários de pico, no fuso da organização" do
      zone = ActiveSupport::TimeZone["America/Sao_Paulo"]
      2.times { chat_for.set(created_at: zone.now.beginning_of_day + 9.hours) }

      result = executor.execute("get_hourly_activity", { "days_back" => 30 })

      expect(result[:total_chats]).to eq(2)
      expect(result[:peak_hours].first).to eq(hour: "09:00", total: 2)
      expect(result[:hourly_summary].size).to eq(24)
    end
  end
end
