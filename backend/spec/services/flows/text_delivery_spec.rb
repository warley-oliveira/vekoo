require "rails_helper"

# O que alguém escreveu no editor chega ao cliente como foi escrito. Só a resposta do modelo passa pela limpeza de
# `MessageHandling`, e nenhum dos dois caminhos deixa o código de um anexo chegar ao cliente. Aqui os blocos são de verdade, e
# o anexo também: só o provedor é de mentira.
RSpec.describe Flows::TextDelivery do
  let(:organization) { create(:organization, credits_total: 10, credits_used: 0) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:chat) { create(:chat, connector: connector) }
  let(:attachment) { create(:attachment, organization: organization, name: "Tabela de preços") }
  let(:media_sent) { [] }
  let(:typed) { %(Copo d'água, "gelado" ~riscado~ `código` [ver] <aqui> **forte**) }

  before do
    allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep)
    stub_flow_channel(connector)
    stub_request(:post, "http://evolution.test/message/sendMedia/#{connector.instance_name}").to_return do |request|
      media_sent << JSON.parse(request.body)
      { status: 201, body: { key: { id: "MEDIA-#{media_sent.length}" } }.to_json, headers: { "Content-Type" => "application/json" } }
    end
  end

  def run_block(type, data, chat: self.chat, playground: false, variables: {})
    flow = published_flow(
      organization,
      [ node("t", "trigger_manual"), node("b", type, data), node("depois", "set_variable", assignments: [ { name: "passou", value: "sim" } ]) ],
      [ edge("t", "b"), edge("b", "depois") ]
    )
    run_flow(flow, chat: chat, playground: playground, variables: variables).reload
  end

  def stored_messages
    ChatMessage::Base.unscoped.where(chat_id: chat.id, role: "assistant").order_by(created_at: :asc).to_a
  end

  describe "texto escrito à mão" do
    %w[send_text ask_question send_interactive].each do |type|
      it "#{type} não tira aspas, til, colchetes nem sinais" do
        run_block(type, { text: typed })

        expect(sent_texts).to eq([ typed ])
      end
    end

    it "guarda na conversa o mesmo texto que o cliente recebe, numa mensagem só" do
      run_block("send_text", { text: typed })

      expect(stored_messages.map(&:content)).to eq([ typed ])
      expect(stored_messages.first).to have_attributes(has_span: false, is_span: false, message_origin: "platform")
      expect(chat.reload.last_message_content).to eq(typed)
    end

    it "não transforma um link em markdown nem o separa do texto" do
      run_block("send_text", { text: "Veja [o site](https://exemplo.com.br) depois" })

      expect(sent_texts).to eq([ "Veja [o site](https://exemplo.com.br) depois" ])
    end

    it "não trata palavra parecida com referência de anexo como anexo" do
      run_block("send_text", { text: "Mandei o attachment_final.pdf ontem" })

      expect(sent_texts).to eq([ "Mandei o attachment_final.pdf ontem" ])
    end

    it "mantém os parágrafos na mesma mensagem" do
      run_block("send_text", { text: "Primeiro.\n\nSegundo." })

      expect(sent_texts).to eq([ "Primeiro.\n\nSegundo." ])
    end

    it "a variável entra como veio" do
      run_block("send_text", { text: "Sua água: {{vars.bebida}}" }, variables: { "bebida" => "Copo d'água" })

      expect(sent_texts).to eq([ "Sua água: Copo d'água" ])
    end

    it "os botões continuam uma mensagem só, com as opções numeradas" do
      run_block("send_interactive", { text: "Copo d'água ou café?", buttons: [ { id: "a", title: "Copo d'água" }, { id: "c", title: "Café" } ] })

      expect(sent_texts).to eq([ "Copo d'água ou café?\n1. Copo d'água\n2. Café" ])
      expect(stored_messages.map(&:has_span)).to eq([ false ])
    end
  end

  describe "anexo citado" do
    let(:cited) { "Segue a tabela attachment_id_#{attachment.id} qualquer dúvida me chame" }

    it "vira mídia no meio do texto, com o nome de verdade do arquivo" do
      execution = run_block("send_text", { text: cited })

      expect(sent_texts).to eq([ "Segue a tabela", "qualquer dúvida me chame" ])
      expect(media_sent.map { |media| media.slice("mediatype", "fileName") }).to eq([ { "mediatype" => "document", "fileName" => "tabela.pdf" } ])
      expect(log_of(execution, "b").output).to eq("sent" => cited)
    end

    it "grava a original para o histórico e as partes para a lista, com a última na prévia da conversa" do
      run_block("send_text", { text: cited })

      original, *parts = stored_messages
      expect(original).to have_attributes(content: cited, has_span: true, is_span: false)
      expect(parts.map(&:is_span)).to eq([ true, true, true ])
      expect(ChatMessage::Media.unscoped.where(chat_id: chat.id).take).to have_attributes(attachment_id: attachment.id.to_s, is_span: true)
      expect(chat.reload).to have_attributes(last_message_content: "qualquer dúvida me chame", last_message_by: "assistant")
    end

    it "não deixa o arquivo baixado para trás" do
      downloads = []
      allow(File).to receive(:binwrite).and_wrap_original do |original, path, *rest|
        downloads << path.to_s
        original.call(path, *rest)
      end

      run_block("send_text", { text: cited })

      expect(downloads.length).to eq(1)
      expect(File.exist?(downloads.first)).to be(false)
    end

    it "não alcança o anexo de outra organização, nem deixa o código chegar" do
      alheio = create(:attachment, organization: create(:organization))

      run_block("send_text", { text: "Segue attachment_id_#{alheio.id} e pronto" })

      expect(media_sent).to be_empty
      expect(sent_texts).to eq([ "Segue", "e pronto" ])
    end

    context "que não existe mais" do
      let(:gone) { "attachment_id_#{SecureRandom.uuid}" }

      it "o resto segue, o código não chega, e o fluxo continua" do
        execution = run_block("send_text", { text: "Segue o catálogo #{gone} qualquer dúvida me chame" })

        expect(sent_texts).to eq([ "Segue o catálogo", "qualquer dúvida me chame" ])
        expect(execution).to have_attributes(status: "completed")
        expect(execution.context["variables"]["passou"]).to eq("sim")
      end

      it "conta no log do bloco e no alerta do fluxo" do
        execution = run_block("send_text", { text: "Segue #{gone}" })

        expect(log_of(execution, "b").output["missing_attachments"]).to contain_exactly(a_string_including(gone.remove("attachment_id_")))
        alert = organization.organization_alerts.active.for_origin("Flow", execution.flow_id).for_code("flow_attachment_missing").take
        expect(alert.message).to include(execution.flow.name)
      end

      it "sem nada mais para enviar, não manda nada" do
        execution = run_block("send_text", { text: gone })

        expect(sent_texts).to be_empty
        expect(stored_messages).to be_empty
        expect(execution).to have_attributes(status: "completed")
      end

      it "vale também para a pergunta e para os botões" do
        expect(log_of(run_block("ask_question", { text: "Viu #{gone} ?" }), "b").output["missing_attachments"]).to be_present
        expect(log_of(run_block("send_interactive", { text: "Viu #{gone} ?", buttons: [ { id: "s", title: "Sim" } ] }), "b").output["missing_attachments"]).to be_present
        expect(sent_texts.join(" ")).not_to include("attachment_id_")
      end
    end

    it "mídia recusada pelo canal aparece no log do bloco, e o fluxo segue" do
      stub_request(:post, "http://evolution.test/message/sendMedia/#{connector.instance_name}").to_return(status: 500, body: "{}")

      execution = run_block("send_text", { text: cited })

      expect(log_of(execution, "b").output["failed_parts"]).to be_present
      expect(execution).to have_attributes(status: "completed")
      expect(sent_texts).to eq([ "Segue a tabela", "qualquer dúvida me chame" ])
    end
  end

  describe "texto do modelo" do
    let(:outputs) { [ { id: "fim", label: "Terminou", when: "O cliente terminou", parameters: [] } ] }
    let(:flow) do
      published_flow(
        organization,
        [ node("t", "trigger_message_received"), node("ia", "ai_assistant", system_prompt: "Atenda.", outputs: outputs), node("fim", "send_text", text: "Tchau") ],
        [ edge("t", "ia"), edge("ia", "fim", "fim") ],
        base_prompt: "Você é a atendente da Doma."
      )
    end

    def contact_says(text)
      ChatMessage::Text.create!(role: "user", content: text, chat: chat, message_id: SecureRandom.hex(4))
    end

    def model_replies(text)
      contact_says("oi")
      script_llm(llm_json(decision: "stay", reason: "conversa", data: {}), llm_text(text))
      run_flow(flow, chat: chat, message: "oi").reload
    end

    it "passa pela limpeza e quebra em parágrafos" do
      model_replies(%(Claro, **temos** "sim".\n\nPosso ajudar em algo mais?))

      expect(sent_texts).to eq([ "Claro, *temos* sim.", "Posso ajudar em algo mais?" ])
    end

    it "um parágrafo só é uma mensagem só" do
      model_replies("Tudo ótimo! Como posso ajudar?")

      expect(sent_texts).to eq([ "Tudo ótimo! Como posso ajudar?" ])
      expect(stored_messages.map(&:has_span)).to eq([ false ])
    end

    it "na próxima rodada o modelo vê a resposta dele inteira, uma vez só" do
      execution = model_replies("Primeiro parágrafo.\n\nSegundo parágrafo.")
      contact_says("e aí?")
      llm = script_llm(llm_json(decision: "stay", reason: "conversa", data: {}), llm_text("Pois é."))

      resume_flow(execution, "e aí?")

      assistant_turns = llm.seen.last[:messages].select { |message| message[:role].to_s == "assistant" }
      expect(assistant_turns.map { |message| message[:content] }).to eq([ "Primeiro parágrafo.\n\nSegundo parágrafo." ])
    end

    it "anexo que o modelo citou vai como mídia" do
      model_replies("Aqui está: attachment_id_#{attachment.id}")

      expect(sent_texts).to eq([ "Aqui está:" ])
      expect(media_sent.map { |media| media["fileName"] }).to eq([ "tabela.pdf" ])
    end

    it "anexo inventado sai da resposta: não levanta, não chega ao cliente e fica no log" do
      execution = model_replies("Veja attachment_id_#{SecureRandom.uuid} e também attachment_cardapio_que_nao_existe.pdf aqui.")

      expect(execution).to have_attributes(status: "waiting_for_message")
      expect(sent_texts.join(" ")).not_to include("attachment")
      expect(sent_texts).to eq([ "Veja e também aqui." ])
      expect(log_of(execution, "ia").output["missing_attachments"].length).to eq(2)
    end

    it "link com a palavra no caminho não é citação" do
      execution = model_replies("Veja https://exemplo.com.br/attachment_id_123/attachment_guia aqui.")

      expect(sent_texts).to include("https://exemplo.com.br/attachment_id_123/attachment_guia")
      expect(log_of(execution, "ia").output).not_to have_key("missing_attachments")
    end

    it "a citação que existe continua indo, mesmo ao lado de uma que não existe" do
      model_replies("Veja attachment_id_#{attachment.id} e attachment_id_#{SecureRandom.uuid} aqui.")

      expect(media_sent.length).to eq(1)
      expect(sent_texts.join(" ")).not_to include("attachment")
    end

    it "o bloco de texto depois da IA continua sem limpeza" do
      flow_after = published_flow(
        organization,
        [ node("t", "trigger_manual"), node("ia", "ai_assistant", mode: "processing", prompt: "Decida.", outputs: outputs), node("fim", "send_text", text: typed) ],
        [ edge("t", "ia"), edge("ia", "fim", "fim") ]
      )
      script_llm(llm_json(decision: "fim", reason: "terminou", data: {}))

      run_flow(flow_after, chat: chat, message: "oi")

      expect(sent_texts).to eq([ typed ])
    end
  end

  describe "de qual fluxo saiu" do
    it "vai em todas as partes da mensagem, e na original" do
      execution = run_block("send_text", { text: "Segue attachment_id_#{attachment.id} e pronto" })

      expect(stored_messages.length).to eq(4)
      expect(stored_messages.map(&:flow_id).uniq).to eq([ execution.flow_id ])
    end

    %w[ask_question send_interactive].each do |type|
      it "vai em #{type}" do
        execution = run_block(type, { text: "Tudo bem?" })

        expect(stored_messages.map(&:flow_id)).to eq([ execution.flow_id ])
      end
    end

    it "vai em send_media" do
      execution = run_block("send_media", { attachment_id: attachment.id })

      expect(stored_messages.map(&:flow_id)).to eq([ execution.flow_id ])
    end

    it "não aparece em mensagem que não é de fluxo" do
      expect(chat.send_text_message("oi").flow_id).to be_nil
    end

    it "sai sem conta e pela plataforma, que é como as métricas enxergam automação" do
      run_block("send_text", { text: "Segue attachment_id_#{attachment.id} e pronto" })

      expect(stored_messages.map(&:role).uniq).to eq([ "assistant" ])
      expect(stored_messages.map(&:message_origin).uniq).to eq([ "platform" ])
      expect(stored_messages.map(&:account_id).uniq).to eq([ nil ])
    end
  end

  describe "os tokens da resposta do modelo" do
    let(:outputs) { [ { id: "fim", label: "Terminou", when: "O cliente terminou", parameters: [] } ] }
    let(:flow) do
      published_flow(
        organization,
        [ node("t", "trigger_message_received"), node("ia", "ai_assistant", system_prompt: "Atenda.", outputs: outputs), node("fim", "send_text", text: "Tchau") ],
        [ edge("t", "ia"), edge("ia", "fim", "fim") ]
      )
    end
    let(:usage) { { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 300, cache_creation_input_tokens: 50 } }

    def model_replies(text)
      ChatMessage::Text.create!(role: "user", content: "oi", chat: chat, message_id: SecureRandom.hex(4))
      script_llm(
        llm_text({ decision: "stay", reason: "conversa", data: {} }.to_json, usage: { input_tokens: 9_999, output_tokens: 9_999 }),
        llm_text(text, usage: usage)
      )
      run_flow(flow, chat: chat, message: "oi").reload
    end

    it "ficam na mensagem, com o cache dentro do prompt e sem os do juiz, que é outro modelo" do
      model_replies("Tudo ótimo!")

      expect(stored_messages.first).to have_attributes(
        usage_model: Ai::Chat::AGENT_MODEL.to_s, usage_prompt_tokens: 450, usage_completion_tokens: 20, usage_cached_tokens: 300, flow_id: flow.id
      )
    end

    it "em partes, ficam só na original, a que as métricas contam" do
      model_replies("Primeiro parágrafo.\n\nSegundo parágrafo.")

      original, *parts = stored_messages
      expect(original).to have_attributes(has_span: true, usage_prompt_tokens: 450, usage_completion_tokens: 20)
      expect(parts.map(&:usage_completion_tokens)).to eq([ nil, nil ])
      expect(parts.map(&:flow_id).uniq).to eq([ flow.id ])
    end

    it "a resposta em partes conta como uma mensagem de automação" do
      model_replies("Primeiro parágrafo.\n\nSegundo parágrafo.")

      zone = ActiveSupport::TimeZone["America/Sao_Paulo"]
      volume = Insights::MessageVolumeDaily.new(organization_id: organization.id, range: day_range(zone.today, zone), zone: zone).to_h

      expect(volume).to include(messages_inbound: 1, messages_sent_by_automation: 1, messages_sent_by_human: 0, messages_sent_by_campaign: 0, messages_by_account: {})
    end

    it "texto escrito à mão não tem tokens" do
      run_block("send_text", { text: "oi" })

      expect(stored_messages.first.usage_model).to be_nil
    end
  end

  describe "no teste do editor" do
    let(:broadcasts) { [] }

    before do
      allow(ActionCable.server).to receive(:broadcast) { |_stream, payload| broadcasts << payload.deep_stringify_keys }
    end

    def of_kind(kind)
      broadcasts.select { |payload| payload["kind"] == kind }
    end

    it "mostra o texto como foi escrito, sem mandar nada para o canal" do
      run_block("send_text", { text: typed }, chat: nil, playground: true)

      expect(of_kind("text").map { |payload| payload["body"] }).to eq([ typed ])
      expect(sent_texts).to be_empty
    end

    it "mostra as partes, com o anexo citado, sem baixar o arquivo" do
      allow(File).to receive(:binwrite).and_call_original

      run_block("send_text", { text: "Segue attachment_id_#{attachment.id} e pronto" }, chat: nil, playground: true)

      expect(of_kind("text").map { |payload| payload["body"] }).to eq([ "Segue", "e pronto" ])
      expect(of_kind("media").map { |payload| payload["attachmentId"] }).to eq([ attachment.id.to_s ])
      expect(of_kind("media").first["url"]).to be_present
      expect(File).not_to have_received(:binwrite)
    end

    it "avisa de anexo que sumiu, sem levantar alerta na organização" do
      execution = run_block("send_text", { text: "Segue attachment_id_#{SecureRandom.uuid}" }, chat: nil, playground: true)

      expect(of_kind("event").map { |payload| payload["name"] }).to include("attachment_missing")
      expect(of_kind("text").map { |payload| payload["body"] }).to eq([ "Segue" ])
      expect(execution).to have_attributes(status: "completed")
      expect(organization.organization_alerts.active.for_code("flow_attachment_missing")).not_to exist
    end
  end
end
