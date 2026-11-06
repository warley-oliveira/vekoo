require "rails_helper"

RSpec.describe Chats::SendOperatorMessage do
  include AttachmentHelpers

  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, name: "Alice Prado") }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:chat) { create(:chat, connector: connector, external_id: "5511999999999@s.whatsapp.net") }
  let(:send_url) { "http://evolution.test/message/sendText/#{connector.instance_name}" }
  let(:message_stream) { ChatMessage::Base.stream_for(chat) }
  # O operador só divide com 10 quebras de linha: um parágrafo comum não vira duas mensagens.
  let(:split_text) { "Olá#{"\n" * 10}Tudo bem?" }

  def send_message(text = "Oi", **options)
    described_class.call(chat: chat, account: account, text: text, **options)
  end

  # Responde com os ids na ordem e guarda o corpo de cada envio.
  def stub_provider(*ids)
    @sent = []
    stub_request(:post, send_url).to_return do |request|
      @sent << JSON.parse(request.body)
      { status: 201, body: { key: { id: ids.shift } }.to_json, headers: { "Content-Type" => "application/json" } }
    end
  end

  def spans
    ChatMessage::Base.unscoped.where(chat_id: chat.id, is_span: true).order_by(created_at: :asc, _id: :asc).to_a
  end

  before { allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep) }

  describe "texto simples" do
    before { stub_provider("OUT-1") }

    it "envia uma vez, sem citação" do
      send_message("Olá, Maria")

      expect(@sent).to contain_exactly(hash_including("text" => "Olá, Maria", "number" => "5511999999999@s.whatsapp.net"))
      expect(@sent.first).not_to have_key("quoted")
    end

    it "grava a mensagem do operador, com quem escreveu" do
      message = send_message("Olá, Maria")

      expect(message).to be_a(ChatMessage::Text)
      expect(message.reload).to have_attributes(
        role: "assistant",
        content: "Olá, Maria",
        sender_name: "Alice Prado",
        account_id: account.id,
        message_origin: "frontend",
        has_span: false,
        is_span: false,
        reply_to_message_id: nil
      )
    end

    it "guarda o id do provedor e marca como entregue ao canal" do
      expect(send_message.reload).to have_attributes(message_id: "OUT-1", status: "delivery_ack", status_message: nil)
    end

    it "atualiza a prévia da lista" do
      send_message("Olá, Maria")

      expect(chat.reload).to have_attributes(last_message_content: "Olá, Maria", last_message_by: "assistant", last_message_type: "text")
      expect(chat.last_message_at.to_time).to be_within(5.seconds).of(Time.current)
    end

    it "transmite a mensagem e depois o status" do
      chat

      expect { send_message("Olá, Maria") }
        .to have_broadcasted_to(message_stream).with(a_hash_including("content" => "Olá, Maria", "status" => nil))
        .and have_broadcasted_to(message_stream).with(a_hash_including("content" => "Olá, Maria", "status" => "delivery_ack", "messageId" => "OUT-1"))
    end
  end

  describe "intervenção humana" do
    before { stub_provider("OUT-1") }

    it "pausa a automação, pelo padrão sem volta automática" do
      expect { send_message }.not_to have_enqueued_job(EnableContactJob)

      expect(chat.reload).to have_attributes(automation_enabled: false, active_job_id: nil, automation_resume_at: nil)
    end

    it "agenda a volta conforme a organização" do
      organization.update!(settings: { "automation_pause_period" => "hours", "automation_pause_time_to" => 2 })

      expect { send_message }.to have_enqueued_job(EnableContactJob).with(chat.id.to_s, organization.id, kind_of(String))

      expect(chat.reload.automation_resume_at).to be_within(5.seconds).of(2.hours.from_now)
    end

    it "pausar de novo invalida o agendamento da mensagem anterior" do
      organization.update!(settings: { "automation_pause_period" => "hours", "automation_pause_time_to" => 2 })
      send_message("primeira")
      first_token = chat.reload.active_job_id

      stub_provider("OUT-2")
      described_class.call(chat: Chat.scoped(organization.id, chat.id), account: account, text: "segunda")

      EnableContactJob.perform_now(chat.id.to_s, organization.id, first_token)

      expect(chat.reload.automation_enabled).to be(false)
    end

    it "deixa a nota da pausa com o nome de quem interveio" do
      send_message

      notes = ChatMessage::Base.unscoped.where(chat_id: chat.id, role_base_type: "automation-toggle-notation")
      expect(notes.map(&:content)).to eq([ "Alice Prado pausou a automação." ])
    end

    it "com a automação já pausada, não repete a nota" do
      chat.set(automation_enabled: false)

      send_message

      expect(ChatMessage::Base.unscoped.where(chat_id: chat.id, role_base_type: "automation-toggle-notation").count).to eq(0)
    end
  end

  describe "texto dividido em partes" do
    before { stub_provider("OUT-1", "OUT-2") }

    it "manda uma mensagem por parte, em ordem" do
      send_message(split_text)

      expect(@sent.map { |body| body["text"] }).to eq([ "Olá", "Tudo bem?" ])
    end

    it "marca a original com has_span e não dá id a ela" do
      expect(send_message(split_text).reload).to have_attributes(content: split_text, has_span: true, message_id: nil, status: nil)
    end

    it "grava cada parte com o id, o status e quem escreveu" do
      send_message(split_text)

      expect(spans.map(&:content)).to eq([ "Olá", "Tudo bem?" ])
      expect(spans.map(&:message_id)).to eq(%w[OUT-1 OUT-2])
      expect(spans).to all(have_attributes(status: "delivery_ack", role: "assistant", has_span: false, sender_name: "Alice Prado", account_id: account.id))
    end

    it "transmite as partes, e nunca a original" do
      chat

      expect { send_message(split_text) }
        .to have_broadcasted_to(message_stream).with(a_hash_including("content" => "Olá", "isSpan" => true))
        .and have_broadcasted_to(message_stream).with(a_hash_including("content" => "Tudo bem?", "isSpan" => true))
        .and have_broadcasted_to(message_stream).exactly(0).times.with(a_hash_including("hasSpan" => true))
    end

    it "a prévia da lista fica com a última parte" do
      send_message(split_text)

      expect(chat.reload.last_message_content).to eq("Tudo bem?")
    end

    it "um parágrafo comum não divide" do
      stub_provider("OUT-1")

      send_message("Olá\n\nTudo bem?")

      expect(@sent.map { |body| body["text"] }).to eq([ "Olá\n\nTudo bem?" ])
    end
  end

  describe "citação" do
    let(:replied) { create(:chat_text_message, chat: chat, content: "Pergunta", message_id: "WAID-PARENT") }

    it "resolve o id externo e leva a citação ao provedor" do
      stub_provider("OUT-1")

      send_message("Resposta", reply_to_message_id: replied.id.to_s)

      expect(@sent.first).to include(
        "quoted" => { "key" => { "remoteJid" => "5511999999999@s.whatsapp.net", "fromMe" => false, "id" => "WAID-PARENT" } }
      )
    end

    it "guarda o id local na mensagem" do
      stub_provider("OUT-1")

      expect(send_message("Resposta", reply_to_message_id: replied.id.to_s).reply_to_message_id).to eq(replied.id.to_s)
    end

    it "em texto dividido, só a primeira parte leva a citação ao provedor" do
      stub_provider("OUT-1", "OUT-2")

      send_message(split_text, reply_to_message_id: replied.id.to_s)

      expect(@sent.first["quoted"]["key"]["id"]).to eq("WAID-PARENT")
      expect(@sent.last).not_to have_key("quoted")
    end

    it "em texto dividido, toda parte guarda o id local, para a tela mostrar o bloco" do
      stub_provider("OUT-1", "OUT-2")

      send_message(split_text, reply_to_message_id: replied.id.to_s)

      expect(spans.map(&:reply_to_message_id)).to all(eq(replied.id.to_s))
    end

    it "cita uma parte, que fica fora do default_scope" do
      part = create(:chat_text_message, chat: chat, role: "assistant", is_span: true, message_id: "WAID-SPAN")
      stub_provider("OUT-1")

      send_message("Resposta", reply_to_message_id: part.id.to_s)

      expect(@sent.first["quoted"]["key"]["id"]).to eq("WAID-SPAN")
    end

    it "com uma citada que não existe, envia sem citação e sem quebrar" do
      stub_provider("OUT-1")

      message = send_message("Resposta", reply_to_message_id: BSON::ObjectId.new.to_s)

      expect(@sent.first).not_to have_key("quoted")
      expect(message.status).to eq("delivery_ack")
    end

    it "com id malformado, envia sem citação" do
      stub_provider("OUT-1")

      send_message("Resposta", reply_to_message_id: "ghost-id")

      expect(@sent.first).not_to have_key("quoted")
    end

    it "não cita mensagem de outra conversa" do
      foreign = create(:chat_text_message, chat: create(:chat, organization: create(:organization)), message_id: "WAID-FORA")
      stub_provider("OUT-1")

      send_message("Resposta", reply_to_message_id: foreign.id.to_s)

      expect(@sent.first).not_to have_key("quoted")
    end

    it "citada sem id no provedor segue sem citação" do
      unsent = create(:chat_text_message, chat: chat, message_id: nil)
      stub_provider("OUT-1")

      send_message("Resposta", reply_to_message_id: unsent.id.to_s)

      expect(@sent.first).not_to have_key("quoted")
    end

    it "id em branco é o mesmo que nenhum" do
      stub_provider("OUT-1")

      expect(send_message("Oi", reply_to_message_id: "").reply_to_message_id).to be_nil
    end

    context "na Z-API" do
      let(:connector) { create(:connector_whatsapp_web, :zapi, organization: organization) }

      it "manda o id da citada em messageId" do
        replied
        send_text = stub_request(:post, "https://api.z-api.io/instances/INST123/token/TOKABC/send-text")
                    .with(body: hash_including("messageId" => "WAID-PARENT", "phone" => "5511999999999"))
                    .to_return(status: 200, body: { messageId: "OUT-1" }.to_json, headers: { "Content-Type" => "application/json" })

        send_message("Resposta", reply_to_message_id: replied.id.to_s)

        expect(send_text).to have_been_requested
      end
    end
  end

  describe "nome do colaborador" do
    before { connector.set(send_collaborator_name: true) }

    it "põe o nome em negrito antes do texto" do
      stub_provider("OUT-1")

      send_message("Olá")

      expect(@sent.first["text"]).to eq("*Alice Prado*\nOlá")
    end

    it "em texto dividido, só na primeira parte" do
      stub_provider("OUT-1", "OUT-2")

      send_message(split_text)

      expect(@sent.map { |body| body["text"] }).to eq([ "*Alice Prado*\nOlá", "Tudo bem?" ])
    end

    it "não entra no conteúdo gravado" do
      stub_provider("OUT-1")

      expect(send_message("Olá").content).to eq("Olá")
    end

    it "desligado, não prefixa" do
      connector.set(send_collaborator_name: false)
      stub_provider("OUT-1")

      send_message("Olá")

      expect(@sent.first["text"]).to eq("Olá")
    end
  end

  describe "resposta da WABA" do
    let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }
    let(:chat) { create(:chat, connector: connector, external_id: "5531971810932") }
    let(:graph_url) { "https://graph.facebook.com/v19.0/#{connector.phone_number_id}/messages" }

    it "guarda o wamid devolvido pelo conector" do
      stub_request(:post, graph_url).to_return(status: 200, body: { messages: [ { id: "wamid.XYZ" } ] }.to_json)

      expect(send_message("Olá").reload).to have_attributes(message_id: "wamid.XYZ", status: "delivery_ack")
    end

    it "manda a citação em context" do
      replied = create(:chat_text_message, chat: chat, message_id: "wamid.PARENT")
      send_text = stub_request(:post, graph_url)
                  .with(body: hash_including("context" => { "message_id" => "wamid.PARENT" }, "to" => 5531971810932))
                  .to_return(status: 200, body: { messages: [ { id: "wamid.XYZ" } ] }.to_json)

      send_message("Resposta", reply_to_message_id: replied.id.to_s)

      expect(send_text).to have_been_requested
    end

    it "recusa da Meta, sem exceção, fica failed" do
      stub_request(:post, graph_url).to_return(status: 400, body: { error: { code: 131_047, message: "Fora da janela" } }.to_json)

      expect(send_message("Olá").reload).to have_attributes(message_id: nil, status: "failed")
    end
  end

  describe "falha do provedor" do
    it "não quebra e deixa a mensagem como failed com a causa" do
      stub_request(:post, send_url).to_return(status: 500, body: "fora do ar")

      message = nil
      expect { message = send_message("Olá") }.not_to raise_error

      expect(message.reload).to have_attributes(message_id: nil, status: "failed", status_message: a_string_including("fora do ar"))
    end

    it "registra a falha no log" do
      stub_request(:post, send_url).to_timeout
      allow(Rails.logger).to receive(:error)

      send_message("Olá")

      expect(Rails.logger).to have_received(:error).with(/text dispatch failed: execution expired/)
    end

    it "transmite o status failed para a tela" do
      stub_request(:post, send_url).to_timeout
      chat

      expect { send_message("Olá") }.to have_broadcasted_to(message_stream).with(
        a_hash_including("status" => "failed", "statusMessage" => "execution expired")
      )
    end

    it "em texto dividido, a parte que falhou leva a causa e as outras seguem" do
      attempts = 0
      stub_request(:post, send_url).to_return do
        attempts += 1
        # A primeira parte esgota as três tentativas do provedor; a segunda passa de primeira.
        attempts <= 3 ? { status: 500, body: "fora do ar" } : { status: 201, body: { key: { id: "OUT-2" } }.to_json, headers: { "Content-Type" => "application/json" } }
      end

      send_message(split_text)

      expect(spans.first).to have_attributes(content: "Olá", message_id: nil, status: "failed", status_message: a_string_including("fora do ar"))
      expect(spans.last).to have_attributes(content: "Tudo bem?", message_id: "OUT-2", status: "delivery_ack", status_message: nil)
    end

    it "sem id na resposta, fica failed sem causa" do
      stub_request(:post, send_url).to_return(status: 201, body: "{}", headers: { "Content-Type" => "application/json" })

      expect(send_message("Olá").reload).to have_attributes(message_id: nil, status: "failed", status_message: nil)
    end

    it "com o conector fechado, fica failed sem chamar o provedor" do
      connector.set(status_cd: "closed")

      expect(send_message("Olá").reload.status).to eq("failed")
      expect(a_request(:post, send_url)).not_to have_been_made
    end
  end

  describe "anexos citados no texto" do
    let(:media_url) { "http://evolution.test/message/sendMedia/#{connector.instance_name}" }
    let(:audio_url) { "http://evolution.test/message/sendWhatsAppAudio/#{connector.instance_name}" }
    let(:sent_ok) { { status: 201, body: { key: { id: "MID-1" } }.to_json, headers: { "Content-Type" => "application/json" } } }
    let!(:attachment) { stub_attachment(filename: "cardapio.pdf", url: "https://cdn.exemplo.com/cardapio.pdf") }

    it "manda o anexo como mídia, e não como texto" do
      send_media = stub_request(:post, media_url)
                   .with(body: hash_including("media" => "https://cdn.exemplo.com/cardapio.pdf", "mediatype" => "document"))
                   .to_return(sent_ok)

      send_message("attachment_id_#{attachment.id}")

      expect(send_media).to have_been_requested
      expect(a_request(:post, send_url)).not_to have_been_made
    end

    it "grava a parte de mídia com quem enviou" do
      stub_request(:post, media_url).to_return(sent_ok)

      send_message("attachment_id_#{attachment.id}")

      expect(spans.first).to be_a(ChatMessage::Media)
      expect(spans.first).to have_attributes(
        role: "assistant",
        is_span: true,
        has_span: false,
        media_type: "document",
        media_url: "https://cdn.exemplo.com/cardapio.pdf",
        attachment_id: attachment.id,
        sender_name: "Alice Prado",
        account_id: account.id,
        message_origin: "frontend"
      )
    end

    it "manda áudio pelo envio de áudio" do
      voice = stub_attachment(filename: "recado.ogg", url: "https://cdn.exemplo.com/recado.ogg")
      send_audio = stub_request(:post, audio_url)
                   .with(body: hash_including("audio" => "https://cdn.exemplo.com/recado.ogg"))
                   .to_return(sent_ok)

      send_message("attachment_id_#{voice.id}")

      expect(send_audio).to have_been_requested
      expect(a_request(:post, media_url)).not_to have_been_made
    end

    it "uma falha ao enviar a mídia não quebra o envio" do
      stub_request(:post, media_url).to_return(status: 500, body: "erro")

      expect { send_message("attachment_id_#{attachment.id}") }.not_to raise_error
    end

    it "mistura texto e mídia, com pausa só quando há partes" do
      stub_request(:post, media_url).to_return(sent_ok)
      stub_provider("OUT-1")
      service = described_class.new(chat, account, "Veja o cardápio attachment_id_#{attachment.id}", nil)
      allow(service).to receive(:sleep)

      message = service.call

      expect(message.has_span).to be(true)
      expect(spans.map(&:class)).to contain_exactly(ChatMessage::Text, ChatMessage::Media)
      expect(service).to have_received(:sleep).with(1).once
    end

    it "sem dividir, não espera" do
      stub_request(:post, media_url).to_return(sent_ok)
      service = described_class.new(chat, account, "attachment_id_#{attachment.id}", nil)
      allow(service).to receive(:sleep)

      service.call

      expect(service).not_to have_received(:sleep)
    end
  end

  describe "anexo citado que não existe" do
    it "manda o texto como veio" do
      stub_provider("OUT-1")

      message = send_message("Olá attachment_id_999")

      expect(@sent.map { |body| body["text"] }).to eq([ "Olá attachment_id_999" ])
      expect(message.reload).to have_attributes(status: "delivery_ack", has_span: false)
    end
  end

  describe "texto em branco" do
    it "não chama o provedor" do
      send_message("   ")

      expect(a_request(:post, send_url)).not_to have_been_made
    end

    it "não quebra sem texto nenhum" do
      expect { send_message(nil) }.not_to raise_error
    end
  end

  describe "canal que ignora a citação (widget do site)" do
    let(:connector) { create(:connector_web_widget, organization: organization) }
    let(:chat) { create(:chat, connector: connector, external_id: "visitante-1") }

    it "aceita a chamada, guarda o id gerado e entrega ao visitante" do
      replied = create(:chat_text_message, chat: chat, message_id: "WID-1")

      message = nil
      expect { message = send_message("Olá", reply_to_message_id: replied.id.to_s) }
        .to have_broadcasted_to(connector.chat_stream(chat)).with(a_hash_including("type" => "message", "content" => "Olá", "role" => "assistant"))

      expect(message.reload).to have_attributes(status: "delivery_ack", message_id: be_present)
    end
  end
end
