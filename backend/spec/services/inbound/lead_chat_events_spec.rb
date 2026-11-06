require "rails_helper"

# Webhook do LeadChat. Não havia spec disto na origem: os cenários vêm de
# `Api::V1::LeadchatController`, e os dois payloads são os de exemplo que ficam no fim dele.
RSpec.describe Inbound::LeadChatEvents do
  include ActiveJob::TestHelper
  include ActiveSupport::Testing::TimeHelpers
  include InboundHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_lead_chat, organization: organization) }
  let(:session_id) { "70c0e0db-88ef-498e-843e-011a6e872b89" }
  let(:content_id) { "a7a54133-bb22-40be-a790-d3f0999697f0" }
  let(:phone) { "5531971810932" }
  let(:contact) { { id: "C1", name: "Pedro Alves", phonenumber: "+#{phone}", pictureUrl: "https://img/pedro.png" } }
  let(:channel) { { humanId: "(31) 3333-0000", platform: "WHATSAPP" } }
  let(:agent) { { name: "Bia" } }

  before do
    allow(Flows::InboundDispatcher).to receive(:call)
    stub_env("OPENAI_ACCESS_TOKEN" => nil)
    stub_session
  end

  def stub_session
    # Num bloco: cada exemplo ajusta `contact` e `agent` antes de o webhook chegar.
    stub_request(:get, %r{\Ahttps://api\.web\.leadchat\.app/chat/v1/session/#{session_id}\?})
      .with(headers: { "Authorization" => "Bearer lead-token" })
      .to_return { { status: 200, headers: InboundHelpers::JSON_HEADERS, body: { contactDetails: contact, channelDetails: channel, agentDetails: agent }.to_json } }
  end

  def webhook(event: "MESSAGE_RECEIVED", **content)
    {
      eventType: event,
      date: "2024-10-31T15:14:13.2353835Z",
      content: {
        id: content_id, senderId: nil, type: "TEXT", active: true, sessionId: session_id, text: "Olá! Tenho interesse",
        direction: "FROM_HUB", status: "DELIVERED", origin: "GATEWAY", details: { file: nil, location: nil, contact: nil, errors: nil }
      }.merge(content),
      changeMetadata: nil
    }
  end

  def receive_event(**options)
    described_class.new(webhook_payload(webhook(**options)), connector: connector).call
  end

  def chat_of(external_id = phone)
    Chat.where(connector_id: connector.id, external_id: external_id).take
  end

  describe "origin API" do
    it "ignora o eco do que nós mesmos enviamos, sem nem ler a sessão" do
      receive_event(origin: "API")

      expect(a_request(:get, /session/)).not_to have_been_made
      expect(Chat.where(connector_id: connector.id).count).to eq(0)
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    it "vale também para MESSAGE_SENT" do
      receive_event(event: "MESSAGE_SENT", origin: "API")

      expect(Chat.where(connector_id: connector.id).count).to eq(0)
    end
  end

  describe "contato" do
    it "tira + e | do telefone" do
      contact[:phonenumber] = "+5531|971810932"

      receive_event

      expect(chat_of(phone)).to be_present
    end

    it "acha a conversa pela variante do 9º dígito" do
      existing = create(:chat, connector: connector, external_id: "553171810932")

      receive_event

      expect(messages_of(existing).count).to eq(1)
      expect(Chat.where(connector_id: connector.id).count).to eq(1)
    end

    it "não mistura com outra conversa nem com outro conector" do
      decoy = create(:chat, connector: connector, external_id: "5531900000000")
      other = create(:chat, connector: create(:connector_lead_chat, organization: organization), external_id: phone)

      receive_event

      expect(messages_of(chat_of).count).to eq(1)
      expect(messages_of(decoy).count).to eq(0)
      expect(messages_of(other).count).to eq(0)
    end

    context "sem telefone, pelo Instagram" do
      before { contact.merge!(phonenumber: nil, instagram: "pedro.alves") }

      it "abre a conversa com o @" do
        receive_event

        expect(chat_of("pedro.alves")).to have_attributes(user_name: "Pedro Alves", organization_id: organization.id)
      end

      it "reaproveita a conversa na mensagem seguinte" do
        receive_event
        receive_event(id: "outra-mensagem")

        expect(Chat.where(connector_id: connector.id).count).to eq(1)
        expect(messages_of(chat_of("pedro.alves")).count).to eq(2)
      end
    end

    context "sem telefone nem Instagram, pelo id do contato" do
      before { contact.merge!(phonenumber: nil, id: "a094a5f6-693c-4868-a717-f03430aa1bb0") }

      it "reaproveita a conversa na mensagem seguinte" do
        receive_event
        receive_event(id: "outra-mensagem")

        expect(Chat.where(connector_id: connector.id).count).to eq(1)
        expect(chat_of("a094a5f6-693c-4868-a717-f03430aa1bb0")).to be_present
      end
    end

    it "sem nenhum identificador, avisa e não abre conversa" do
      contact.merge!(phonenumber: nil, id: nil)
      allow(Rails.logger).to receive(:warn)

      receive_event

      expect(Chat.where(connector_id: connector.id).count).to eq(0)
      expect(Rails.logger).to have_received(:warn).with(a_string_including("Contato sem telefone"))
    end

    it "conversa nova nasce com a automação padrão da organização" do
      organization.update!(settings: { "default_automation_enabled" => false })

      receive_event

      expect(chat_of.automation_enabled).to be(false)
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end
  end

  describe "TEXT" do
    it "grava a mensagem do contato" do
      receive_event

      expect(ChatMessage::Text.where(chat_id: chat_of.id, message_id: content_id).take).to have_attributes(
        role: "user", content: "Olá! Tenho interesse", message_origin: "platform", sender_name: "Pedro Alves"
      )
    end

    it "entrega aos fluxos como primeira mensagem" do
      receive_event

      expect(Flows::InboundDispatcher).to have_received(:call).with(chat: chat_of, text: "Olá! Tenho interesse", event: "first_message", message_id: content_id)
    end

    it "as seguintes são message_received" do
      receive_event
      receive_event(id: "segunda", text: "Oi?")

      expect(Flows::InboundDispatcher).to have_received(:call).with(chat: chat_of, text: "Oi?", event: "message_received", message_id: "segunda")
    end

    it "guarda os dados da sessão na conversa" do
      receive_event

      expect(chat_of).to have_attributes(
        user_name: "Pedro Alves",
        profile_picture_url: "https://img/pedro.png",
        origin_phone_number: "553133330000",
        contact_origin: "WHATSAPP",
        external_fields: { "session_id" => session_id, "contact_id" => "C1" }
      )
    end

    it "atualiza nome e foto de quem já tinha conversa" do
      existing = create(:chat, connector: connector, external_id: phone, user_name: "Antigo")

      receive_event

      expect(existing.reload).to have_attributes(user_name: "Pedro Alves", profile_picture_url: "https://img/pedro.png")
    end

    it "conta como não lida e atualiza a prévia" do
      receive_event

      expect(chat_of).to have_attributes(unread_messages: 1, last_message_content: "Olá! Tenho interesse", last_message_by: "user", last_message_type: "text")
    end

    it "com a automação da conversa desligada, grava sem chamar os fluxos" do
      create(:chat, connector: connector, external_id: phone, automation_enabled: false)

      receive_event

      expect(chat_of.unread_messages).to eq(1)
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end
  end

  describe "reentrega" do
    it "não processa o mesmo id duas vezes" do
      2.times { receive_event }

      expect(messages_of(chat_of).count).to eq(1)
      expect(Flows::InboundDispatcher).to have_received(:call).once
    end

    it "depois de o cache expirar, a mensagem gravada ainda segura" do
      receive_event
      travel(16.minutes) { receive_event }

      expect(messages_of(chat_of).count).to eq(1)
      expect(Flows::InboundDispatcher).to have_received(:call).once
    end

    it "não enfileira o mesmo áudio duas vezes" do
      expect {
        2.times { receive_event(type: "AUDIO", details: { file: { publicUrl: "https://lc/audio.mp3" } }) }
      }.to have_enqueued_job(AudioMessageJob).once
    end
  end

  # O job refaz tudo depois de um erro: a marca de "já processada" não pode barrar a própria
  # retentativa, senão a mensagem some em silêncio.
  describe "nova tentativa depois de um erro" do
    it "grava a mensagem que falhou na primeira vez" do
      allow(ChatMessage::Text).to receive(:create!).and_raise(StandardError, "mongo fora")

      expect { receive_event }.to raise_error(StandardError, "mongo fora")

      allow(ChatMessage::Text).to receive(:create!).and_call_original
      receive_event

      expect(messages_of(chat_of).pluck(:message_id)).to eq([ content_id ])
      expect(Flows::InboundDispatcher).to have_received(:call).once
    end

    it "sessão fora do ar sobe para o job, sem marcar como processada" do
      stub_request(:get, %r{/chat/v1/session/}).to_return(status: 500, body: { error: "fora" }.to_json)

      expect { receive_event }.to raise_error(StandardError)

      stub_session
      receive_event

      expect(messages_of(chat_of).count).to eq(1)
    end
  end

  describe "MESSAGE_SENT" do
    before { organization.update!(settings: { "automation_pause_period" => "days", "automation_pause_time_to" => 1 }) }

    let!(:chat) { create(:chat, connector: connector, external_id: phone, origin_phone_number: "553133330000", unread_messages: 2) }

    def sent(**content)
      receive_event(event: "MESSAGE_SENT", id: "347bece4", direction: "TO_HUB", origin: "BOT", text: "Aqui é o Rafael", **content)
    end

    it "entra como nossa, assinada com o número e o nome do atendente" do
      sent

      expect(ChatMessage::Text.where(chat_id: chat.id, message_id: "347bece4").take).to have_attributes(
        role: "assistant", message_origin: "user", content: "Aqui é o Rafael", sender_name: "(31) 3333-0000 - Bia"
      )
    end

    it "sem atendente, assina como LeadChat" do
      agent.delete(:name)

      sent

      expect(ChatMessage::Text.where(chat_id: chat.id).take.sender_name).to eq("(31) 3333-0000 - LeadChat")
    end

    it "formata número de 11 dígitos com o 9" do
      chat.set(origin_phone_number: "5531971810000")

      sent

      expect(ChatMessage::Text.where(chat_id: chat.id).take.sender_name).to start_with("(31) 97181-0000 - ")
    end

    it "pausa a automação, agenda a volta e zera as não lidas" do
      expect { sent }.to have_enqueued_job(EnableContactJob)

      expect(chat.reload).to have_attributes(automation_enabled: false, unread_messages: 0, last_message_by: "assistant")
      expect(chat.automation_resume_at).to be_within(5.seconds).of(1.day.from_now)
    end

    it "não chama os fluxos" do
      sent

      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end
  end

  describe "comandos" do
    let!(:chat) { create(:chat, connector: connector, external_id: phone, automation_enabled: false) }
    let!(:send_text) do
      stub_request(:post, "https://api.web.leadchat.app/chat/v1/session/#{session_id}/message/sync")
        .with(headers: { "Authorization" => "Bearer lead-token" })
        .to_return(status: 200, headers: InboundHelpers::JSON_HEADERS, body: { id: "resposta" }.to_json)
    end

    it "--X-CLEAR-CONTEXT-X-- limpa o contexto e responde na sessão" do
      previous = create(:chat_text_message, chat: chat, content: "antes")

      receive_event(text: "  --X-CLEAR-CONTEXT-X-- ")

      expect(previous.reload.active).to be(false)
      expect(chat.reload.automation_enabled).to be(true)
      expect(notes_of(chat, "context-clear").count).to eq(1)
      expect(send_text.with(body: { text: "Contexto limpo" }.to_json)).to have_been_requested
      expect(ChatMessage::Text.where(chat_id: chat.id, message_id: content_id).exists?).to be(false)
      expect(Flows::InboundDispatcher).not_to have_received(:call)
    end

    # O LeadChat tem comando próprio, para não colidir com o texto dos outros canais.
    %w[CCTX --CLEAR-CONTEXT-- --RE-ACTIVE-ME--].each do |text|
      it "#{text} é mensagem comum" do
        receive_event(text: text)

        expect(chat.reload.automation_enabled).to be(false)
        expect(messages_of(chat).pluck(:content)).to eq([ text ])
        expect(send_text).not_to have_been_requested
      end
    end
  end

  describe "AUDIO" do
    let(:audio_url) { "https://files.leadchat.app/audio/abc.mp3" }

    def receive_audio(event: "MESSAGE_RECEIVED")
      receive_event(event: event, type: "AUDIO", text: nil, details: { file: { publicUrl: audio_url } })
    end

    it "enfileira o job com o link público e o nome do contato" do
      expect { receive_audio }.to have_enqueued_job(AudioMessageJob).with(anything, organization.id, audio_url, content_id, false, "Pedro Alves")
    end

    it "guarda a sessão na conversa, para poder responder" do
      receive_audio

      expect(chat_of.external_fields).to eq("session_id" => session_id, "contact_id" => "C1")
    end

    it "do webhook até o áudio na conversa" do
      stub_request(:get, audio_url).to_return(status: 200, body: "bytes-mp3")

      perform_enqueued_jobs { receive_audio }

      message = ChatMessage::Audio.where(chat_id: chat_of.id, message_id: content_id).take
      expect(message).to have_attributes(role: "user", content: "-")
      expect(blob_of(message).download).to eq("bytes-mp3")
      expect(blob_of(message).filename.to_s).to eq("#{phone}-#{content_id}.mp3")
      expect(Flows::InboundDispatcher).to have_received(:call).with(chat: chat_of, text: "", event: "first_message", message_id: content_id)
    end

    it "áudio nosso entra como nosso e pausa a automação" do
      stub_request(:get, audio_url).to_return(status: 200, body: "bytes-mp3")

      perform_enqueued_jobs(only: AudioMessageJob) { receive_audio(event: "MESSAGE_SENT") }

      expect(ChatMessage::Audio.where(chat_id: chat_of.id).take).to have_attributes(role: "assistant", message_origin: "user", content: "")
      expect(chat_of.automation_enabled).to be(false)
    end

    it "áudio que não baixa vira nota de erro, nunca um arquivo com a página de erro" do
      stub_request(:get, audio_url).to_return(status: 404, body: "<html>não achei</html>")

      perform_enqueued_jobs { receive_audio }

      expect(ChatMessage::Audio.where(chat_id: chat_of.id).exists?).to be(false)
      expect(notes_of(chat_of, "error").take.content).to eq("Chegou uma mídia que não foi possível baixar.")
    end

    it "sem link não grava nada" do
      perform_enqueued_jobs { receive_event(type: "AUDIO", details: { file: nil }) }

      expect(messages_of(chat_of).count).to eq(0)
    end
  end

  describe "tipo não suportado" do
    it "só vai para o log" do
      allow(Rails.logger).to receive(:warn)

      expect { receive_event(type: "IMAGE") }.not_to have_enqueued_job

      expect(messages_of(chat_of).count).to eq(0)
      expect(Rails.logger).to have_received(:warn).with(a_string_including("Unsupported type: IMAGE"))
    end
  end
end
