require "rails_helper"

# Os blocos de IA, com o modelo de mentira (`script_llm`): o resto é de verdade, inclusive o crédito que sobe e desce.
RSpec.describe "Blocos de IA" do
  include ActiveJob::TestHelper
  include ActionCable::TestHelper

  let(:organization) { create(:organization, credits_total: 10, credits_used: 0) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:chat) { create(:chat, connector: connector, user_name: "Fernanda Lima") }

  before do
    allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep)
    stub_flow_channel(connector)
  end

  def spent
    organization.reload.credits_used
  end

  def contact_says(text)
    ChatMessage::Text.create!(role: "user", content: text, chat: chat, message_id: SecureRandom.hex(4))
  end

  describe "ai_assistant, conversando" do
    let(:outputs) { [ { id: "comprar", label: "Quer comprar", when: "O cliente quer comprar", parameters: [ { name: "produto", type: "string", required: true, description: "O produto" } ] } ] }
    let(:flow) do
      published_flow(
        organization,
        [
          node("t", "trigger_message_received"),
          node("ia", "ai_assistant", system_prompt: "Atenda {{contact.name}}.", outputs: outputs),
          node("fim", "send_text", text: "Reservando {{vars.produto}}")
        ],
        [ edge("t", "ia"), edge("ia", "fim", "comprar") ],
        fields: [ { key: "produto", type: "string" } ],
        base_prompt: "Você é a atendente da Doma."
      )
    end

    it "fica: o juiz decide no modelo rápido, a conversa responde no principal, e espera" do
      contact_says("oi, tudo bem?")
      llm = script_llm(llm_json(decision: "stay", reason: "só cumprimentou", data: { produto: nil }), llm_text("Tudo ótimo! Como posso ajudar?"))

      execution = run_flow(flow, chat: chat, message: "oi, tudo bem?").reload

      expect(execution).to have_attributes(status: "waiting_for_message", current_node_id: "ia")
      expect(sent_texts).to eq([ "Tudo ótimo! Como posso ajudar?" ])

      judge, reply = llm.seen
      expect(judge[:model]).to eq(Ai::Chat::FAST_MODEL)
      expect(judge[:schema]["properties"]["decision"]["enum"]).to eq(%w[comprar stay])
      expect(reply[:model]).to eq(Ai::Chat::AGENT_MODEL)
      expect(reply[:system]).to eq("Você é a atendente da Doma.\n\nAtenda Fernanda Lima.")
      expect(reply[:messages].last).to eq(role: "user", content: "oi, tudo bem?")
    end

    it "sai quando a condição é atendida, com os dados que ela pede, sem responder" do
      contact_says("quero a caneca azul")
      script_llm(llm_json(decision: "comprar", reason: "pediu", data: { produto: "caneca azul" }))

      execution = run_flow(flow, chat: chat, message: "quero a caneca azul").reload

      expect(execution.status).to eq("completed")
      expect(sent_texts).to eq([ "Reservando caneca azul" ])
      expect(chat.reload.flow_data[flow.id.to_s]).to include("produto" => "caneca azul")
    end

    it "não sai sem o dado obrigatório: pede para a conversa obter, e fica" do
      contact_says("quero comprar")
      llm = script_llm(llm_json(decision: "comprar", reason: "pediu", data: { produto: nil }), llm_text("Qual produto?"))

      execution = run_flow(flow, chat: chat, message: "quero comprar").reload

      expect(execution.status).to eq("waiting_for_message")
      expect(llm.seen.last[:context]).to include("produto")
    end

    it "retoma a conversa, até a saída" do
      contact_says("oi")
      script_llm(llm_json(decision: "stay", reason: "", data: { produto: nil }), llm_text("Oi!"))
      execution = run_flow(flow, chat: chat, message: "oi")

      contact_says("quero a caneca")
      script_llm(llm_json(decision: "comprar", reason: "", data: { produto: "caneca" }))
      resume_flow(execution, "quero a caneca")

      expect(execution.reload.status).to eq("completed")
      expect(sent_texts).to eq([ "Oi!", "Reservando caneca" ])
    end

    it "conta o limite de mensagens, e sai por maxTurns" do
      flow = published_flow(
        organization,
        [ node("t", "trigger_manual"), node("ia", "ai_assistant", max_turns: 1, outputs: outputs), node("a", "send_text", text: "cheguei"), node("limite", "send_text", text: "limite") ],
        [ edge("t", "ia"), edge("ia", "a", "comprar"), edge("ia", "limite", "maxTurns") ]
      )
      contact_says("oi")
      script_llm(llm_json(decision: "stay", reason: "", data: { produto: nil }))

      run_flow(flow, chat: chat, message: "oi")

      expect(sent_texts).to eq([ "limite" ])
    end

    it "respeita o mínimo de trocas antes de chamar o juiz" do
      flow = published_flow(
        organization,
        [ node("t", "trigger_manual"), node("ia", "ai_assistant", min_turns: 2, outputs: outputs), node("a", "send_text", text: "x") ],
        [ edge("t", "ia"), edge("ia", "a", "comprar") ]
      )
      contact_says("oi")
      llm = script_llm(llm_text("Oi!"))

      run_flow(flow, chat: chat, message: "oi")

      expect(llm.seen.length).to eq(1)
      expect(sent_texts).to eq([ "Oi!" ])
    end

    it "uma saída sem conexão não vira opção para a IA" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("ia", "ai_assistant", outputs: outputs) ], [ edge("t", "ia") ])
      contact_says("oi")
      llm = script_llm(llm_text("Oi!"))

      run_flow(flow, chat: chat, message: "oi")

      expect(llm.seen.length).to eq(1)
    end

    it "fala primeiro quando chega numa etapa com a mensagem já respondida" do
      flow = published_flow(
        organization,
        [
          node("t", "trigger_manual"),
          node("a", "ai_assistant", system_prompt: "Etapa A", outputs: [ { id: "ir", label: "Ir", when: "pronto" } ]),
          node("b", "ai_assistant", system_prompt: "Etapa B")
        ],
        [ edge("t", "a"), edge("a", "b", "ir") ]
      )
      contact_says("oi")
      script_llm(llm_json(decision: "stay", reason: ""), llm_text("Oi da etapa A"))
      execution = run_flow(flow, chat: chat, message: "oi")

      contact_says("pode seguir")
      llm = script_llm(llm_json(decision: "ir", reason: "pronto"), llm_text("Oi da etapa B"))
      resume_flow(execution, "pode seguir")

      # A mensagem ainda é nova para a etapa B: quem saiu da A só decidiu, sem responder.
      expect(llm.seen.last[:system]).to eq("Etapa B")
      expect(sent_texts.last).to eq("Oi da etapa B")
    end

    it "só espera, no teste, enquanto o contato não falou" do
      expect(run_flow(flow, playground: true).reload.status).to eq("waiting_for_message")
    end

    it "manda só o que a API aceita: começa e termina com o contato, nada vazio" do
      ChatMessage::Text.create!(role: "assistant", content: "Olá, sou da campanha!", chat: chat)
      contact_says("")
      contact_says("oi")
      llm = script_llm(llm_json(decision: "stay", reason: "", data: { produto: nil }), llm_text("Oi!"))

      run_flow(flow, chat: chat, message: "oi")

      messages = llm.seen.last[:messages]
      expect(messages.first[:role]).to eq("user")
      expect(messages.last).to eq(role: "user", content: "oi")
      expect(messages.pluck(:content)).to all(be_present)
    end
  end

  describe "ai_assistant, com ferramentas" do
    let(:tool) { create(:tool_function, organization: organization, name: "consultar_frete", js_code: "return { prazo: params.cep === '80000000' ? 3 : 9 };") }
    let(:flow) do
      published_flow(organization, [ node("t", "trigger_manual"), node("ia", "ai_assistant", tool_ids: [ tool.id.to_s ]) ], [ edge("t", "ia") ])
    end

    it "vai para o processo de scripts e, com a resposta da função, responde" do
      contact_says("frete para 80000000?")
      llm = script_llm(llm_tool("consultar_frete", { "cep" => "80000000" }, id: "toolu_1"), llm_text("Chega em 3 dias."))

      expect { run_flow(flow, chat: chat, message: "frete para 80000000?") }.to have_enqueued_job(Flows::ScriptStepJob)
      perform_enqueued_jobs

      expect(sent_texts).to eq([ "Chega em 3 dias." ])
      expect(llm.seen.first[:tools]).to eq([ { name: "consultar_frete", description: "Consulta um CEP", input_schema: tool.input_schema } ])
      result = llm.seen.last[:messages].last[:content].first
      expect(result).to include(type: :tool_result, tool_use_id: "toolu_1")
      expect(JSON.parse(result[:content])).to eq("prazo" => 3)
    end

    it "o erro do script volta para o modelo, em vez de derrubar a rodada" do
      tool.update!(js_code: "throw new Error('fora do ar');")
      contact_says("frete?")
      llm = script_llm(llm_tool("consultar_frete", { "cep" => "1" }), llm_text("Não consegui consultar agora."))

      perform_enqueued_jobs { run_flow(flow, chat: chat, message: "frete?") }

      expect(sent_texts).to eq([ "Não consegui consultar agora." ])
      expect(JSON.parse(llm.seen.last[:messages].last[:content].first[:content])["error"]).to include("fora do ar")
    end

    it "sem ferramenta escolhida, o modelo não recebe nenhuma e nem passa pelo processo de scripts" do
      tool
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("ia", "ai_assistant") ], [ edge("t", "ia") ])
      contact_says("oi")
      llm = script_llm(llm_text("Oi!"))

      expect { run_flow(flow, chat: chat, message: "oi") }.not_to have_enqueued_job(Flows::ScriptStepJob)

      expect(llm.seen.first[:tools]).to eq([])
    end

    it "para depois de voltas demais em ferramenta" do
      contact_says("frete?")
      script_llm(*Array.new(6) { llm_tool("consultar_frete", { "cep" => "1" }) })

      perform_enqueued_jobs { run_flow(flow, chat: chat, message: "frete?") }

      expect(FlowExecution.where(flow: flow).take).to have_attributes(status: "failed", error_message: a_string_including("max_tool_loops_exceeded"))
    end
  end

  describe "ai_assistant, processando" do
    let(:flow) do
      published_flow(
        organization,
        [
          node("t", "trigger_manual"),
          node("ia", "ai_assistant", mode: "processing", system_prompt: "Decida", model_size: "fast", outputs: [ { id: "a", label: "A" }, { id: "b", label: "B", default: true } ]),
          node("sa", "send_text", text: "foi a"),
          node("sb", "send_text", text: "foi b")
        ],
        [ edge("t", "ia"), edge("ia", "sa", "a"), edge("ia", "sb", "b") ]
      )
    end

    it "escolhe a saída sem falar com o contato" do
      contact_says("oi")
      script_llm(llm_json(decision: "a"))

      run_flow(flow, chat: chat, message: "oi")

      expect(sent_texts).to eq([ "foi a" ])
    end

    it "resposta fora da lista cai na saída padrão" do
      contact_says("oi")
      script_llm(llm_json(decision: "zzz"))

      run_flow(flow, chat: chat, message: "oi")

      expect(sent_texts).to eq([ "foi b" ])
    end

    it "sem saída ligada, para a execução" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("ia", "ai_assistant", mode: "processing") ], [ edge("t", "ia") ])

      expect(run_flow(flow, chat: chat, message: "oi").reload).to have_attributes(status: "failed", error_message: a_string_including("nenhuma saída"))
    end
  end

  describe "os créditos" do
    let(:flow) do
      published_flow(
        organization,
        [ node("t", "trigger_manual"), node("ia", "ai_assistant", outputs: [ { id: "x", label: "X" } ]), node("a", "send_text", text: "saiu") ],
        [ edge("t", "ia"), edge("ia", "a", "x") ]
      )
    end

    before { contact_says("oi") }

    it "uma rodada que responde custa 2 no modelo principal, com o juiz incluído" do
      script_llm(llm_json(decision: "stay", reason: ""), llm_text("Oi!"))

      run_flow(flow, chat: chat, message: "oi")

      expect(spent).to eq(2)
    end

    it "no modelo rápido, custa 1" do
      flow = published_flow(
        organization,
        [ node("t", "trigger_manual"), node("ia", "ai_assistant", model_size: "fast", outputs: [ { id: "x", label: "X" } ]), node("a", "send_text", text: "saiu") ],
        [ edge("t", "ia"), edge("ia", "a", "x") ]
      )
      script_llm(llm_json(decision: "stay", reason: ""), llm_text("Oi!"))

      run_flow(flow, chat: chat, message: "oi")

      expect(spent).to eq(1)
    end

    it "sair sem responder custa só o juiz" do
      script_llm(llm_json(decision: "x", reason: ""))

      run_flow(flow, chat: chat, message: "oi")

      expect(spent).to eq(1)
    end

    it "devolve o crédito se o modelo falhar" do
      script_llm(Ai::Chat::Failed.new("overloaded"))

      execution = run_flow(flow, chat: chat, message: "oi").reload

      expect(spent).to eq(0)
      expect(execution).to have_attributes(status: "failed", error_message: a_string_including("overloaded"))
    end

    it "sem crédito, não chama o modelo, para com o motivo e avisa a organização" do
      organization.update!(credits_used: 10)
      llm = script_llm

      execution = run_flow(flow, chat: chat, message: "oi").reload

      expect(llm.seen).to be_empty
      expect(execution).to have_attributes(status: "failed", error_message: I18n.t("automation.flows.errors.no_credits"))
      expect(organization.organization_alerts.active.for_code("flow_no_credits")).to exist
    end

    it "sem chave, para com o motivo e sem cobrar" do
      allow(Ai::Chat).to receive(:new).and_call_original
      allow(ENV).to receive(:[]).and_call_original
      allow(ENV).to receive(:[]).with("ANTHROPIC_API_KEY").and_return(nil)

      execution = run_flow(flow, chat: chat, message: "oi").reload

      expect(execution.error_message).to eq(I18n.t("automation.flows.errors.ai_unavailable"))
      expect(spent).to eq(0)
    end
  end

  describe "ai_intent_classification" do
    def run_it(*responses, **data)
      flow = published_flow(
        organization,
        [
          node("t", "trigger_manual"),
          node("ia", "ai_intent_classification", { outputs: [ { id: "vendas", label: "Vendas" }, { id: "suporte", label: "Suporte" } ] }.merge(data)),
          node("v", "send_text", text: "vendas"), node("s", "send_text", text: "suporte"), node("o", "send_text", text: "outros"), node("e", "send_text", text: "erro")
        ],
        [ edge("t", "ia"), edge("ia", "v", "vendas"), edge("ia", "s", "suporte"), edge("ia", "o", "default"), edge("ia", "e", "onError") ]
      )
      @llm = script_llm(*responses)
      run_flow(flow, chat: chat, message: "quero comprar").reload
    end

    it "roteia pela intenção, no modelo rápido, e guarda a variável" do
      execution = run_it(llm_json(intent: "vendas"))

      expect(sent_texts).to eq([ "vendas" ])
      expect(execution.variables["last_intent"]).to eq("vendas")
      expect(@llm.seen.first[:model]).to eq(Ai::Chat::FAST_MODEL)
      expect(@llm.seen.first[:schema]["properties"]["intent"]["enum"]).to eq(%w[vendas suporte default])
      expect(spent).to eq(1)
    end

    it "não herda o prompt base" do
      flow = published_flow(
        organization,
        [ node("t", "trigger_manual"), node("ia", "ai_intent_classification", outputs: [ { id: "a", label: "A" } ]) ],
        [ edge("t", "ia") ],
        base_prompt: "prompt base"
      )
      llm = script_llm(llm_json(intent: "a"))

      run_flow(flow, chat: chat, message: "x")

      expect(llm.seen.first[:system]).not_to include("prompt base")
    end

    it "fora da lista, cai no default" do
      run_it(llm_json(intent: "qualquer"))

      expect(sent_texts).to eq([ "outros" ])
    end

    it "falha do modelo segue por onError e devolve o crédito" do
      run_it(Ai::Chat::Failed.new("overloaded"))

      expect(sent_texts).to eq([ "erro" ])
      expect(spent).to eq(0)
    end
  end

  describe "ai_sentiment" do
    it "roteia pelo sentimento" do
      flow = published_flow(
        organization,
        [ node("t", "trigger_manual"), node("ia", "ai_sentiment"), node("n", "send_text", text: "triste") ],
        [ edge("t", "ia"), edge("ia", "n", "negative") ]
      )
      script_llm(llm_json(sentiment: "negative"))

      execution = run_flow(flow, chat: chat, message: "que péssimo").reload

      expect(sent_texts).to eq([ "triste" ])
      expect(execution.variables["last_sentiment"]).to eq("negative")
    end
  end

  describe "ai_parameter_extractor" do
    let(:fields) { [ { name: "cidade", type: "string", description: "A cidade" }, { name: "idade", type: "integer", description: "Idade" } ] }

    it "guarda o que achou, e nulo não apaga o que já havia" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("ia", "ai_parameter_extractor", fields: fields) ], [ edge("t", "ia") ])
      llm = script_llm(llm_json(cidade: "Curitiba", idade: nil))

      execution = run_flow(flow, chat: chat, message: "moro em Curitiba", variables: { idade: 30 }).reload

      expect(execution.variables).to include("cidade" => "Curitiba", "idade" => 30)
      expect(llm.seen.first[:schema]["properties"]["idade"]).to include("type" => %w[integer null])
      expect(llm.seen.first[:schema]["required"]).to eq(%w[cidade idade])
    end

    it "sem campos, sai por onError sem chamar o modelo" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("ia", "ai_parameter_extractor"), node("e", "send_text", text: "erro") ], [ edge("t", "ia"), edge("ia", "e", "onError") ])
      llm = script_llm

      run_flow(flow, chat: chat, message: "x")

      expect(llm.seen).to be_empty
      expect(sent_texts).to eq([ "erro" ])
    end
  end

  describe "ai_audio_transcription" do
    before { stub_public_dns("cdn.exemplo.test") }

    it "o áudio recebido já vem transcrito, e não cobra" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("ia", "ai_audio_transcription", save_to: "fala") ], [ edge("t", "ia") ])

      execution = run_flow(flow, chat: chat, message: "bom dia, quero marcar").reload

      expect(execution.variables["fala"]).to eq("bom dia, quero marcar")
      expect(spent).to eq(0)
    end

    it "áudio sem transcrição sai por onError" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("ia", "ai_audio_transcription"), node("e", "send_text", text: "erro") ], [ edge("t", "ia"), edge("ia", "e", "onError") ])

      run_flow(flow, chat: chat, message: "-")

      expect(sent_texts).to eq([ "erro" ])
    end

    it "com URL, baixa e transcreve, por 1 crédito" do
      stub_request(:get, "https://cdn.exemplo.test/a.ogg").to_return(status: 200, body: "bytes")
      allow(Chats::AudioTranscriber).to receive(:call).and_return("olá")
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("ia", "ai_audio_transcription", audio_url: "https://cdn.exemplo.test/a.ogg") ], [ edge("t", "ia") ])

      execution = run_flow(flow, chat: chat).reload

      expect(execution.variables["last_transcription"]).to eq("olá")
      expect(spent).to eq(1)
    end

    it "devolve o crédito se a transcrição não sair, e não alcança a rede interna" do
      stub_public_dns("interno.exemplo.test", ip: "10.0.0.1")
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("ia", "ai_audio_transcription", audio_url: "https://interno.exemplo.test/a.ogg") ], [ edge("t", "ia") ])

      execution = run_flow(flow, chat: chat).reload

      expect(spent).to eq(0)
      expect(execution.variables).not_to have_key("last_transcription")
      expect(a_request(:any, /interno/)).not_to have_been_made
    end
  end

  describe "no teste do editor" do
    let(:flow) do
      published_flow(organization, [ node("t", "trigger_manual"), node("ia", "ai_assistant", system_prompt: "Atenda") ], [ edge("t", "ia") ])
    end

    it "conversa pelo histórico do teste, e nada vai para o canal" do
      test_chat = create(:chat, organization: organization, external_id: Chat::TEST_EXTERNAL_ID)
      llm = script_llm(llm_text("Oi, teste!"))

      execution = FlowRuntime::Engine.start(flow: flow, chat: test_chat, playground: true, last_message: FlowRuntime::InboundMessage.new("oi"))

      expect(llm.seen.last[:messages]).to eq([ { role: "user", content: "oi" } ])
      expect(execution.reload.context["playground_messages"]).to eq(
        [ { "role" => "user", "content" => "oi" }, { "role" => "assistant", "content" => "Oi, teste!" } ]
      )
      expect(sent_texts).to be_empty
    end

    it "transmite cada bloco e cada mensagem, em camelCase" do
      test_chat = create(:chat, organization: organization, external_id: Chat::TEST_EXTERNAL_ID)
      script_llm(llm_text("Oi!"))
      execution = FlowExecution.create!(
        flow: flow, flow_version: flow.published_version, organization_id: organization.id, chat_id: test_chat.id.to_s,
        status: "pending", context: {}, playground: true, current_node_id: "ia"
      )
      stream = FlowRuntime::MessageDispatcher.playground_stream(execution)

      Flows::ResumeExecutionJob.perform_now(execution.id, organization.id, { "first_run" => true, "user_text" => "oi" })

      kinds = broadcasts(stream).map { |payload| JSON.parse(payload) }
      expect(kinds.pluck("kind")).to eq(%w[node_entered ai_decision text node_completed suspended])
      expect(kinds.first).to include("nodeId" => "ia", "nodeType" => "ai_assistant")
      expect(kinds.second).to include("decision" => "stay", "turn" => 1)
      expect(kinds.third).to include("body" => "Oi!")
    end
  end
end
