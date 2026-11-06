require "rails_helper"

# Onde o webhook é processado de verdade. Na origem o processamento ficava no controlador, que
# engolia a exceção para responder 2xx: aqui o 2xx já foi, e é o job que tenta de novo.
RSpec.describe Inbound::ProcessWebhookJob do
  include ActiveJob::TestHelper
  include InboundHelpers

  let(:organization) { create(:organization) }

  before { allow(Flows::InboundDispatcher).to receive(:call) }

  it "roda na fila critical" do
    expect(described_class.new.queue_name).to eq("critical")
  end

  describe "cada provedor chega no seu processador" do
    it "whatsapp_cloud" do
      connector = create(:connector_whatsapp_cloud, organization: organization)
      body = {
        entry: [ { id: connector.waba_id.to_s, changes: [ { value: {
          metadata: { phone_number_id: connector.phone_number_id.to_s },
          contacts: [ { wa_id: "5531971810932", profile: { name: "Maria" } } ],
          messages: [ { id: "wamid.1", from: "5531971810932", type: "text", text: { body: "Oi" } } ]
        } } ] } ]
      }.to_json

      described_class.perform_now("whatsapp_cloud", body, connector.id.to_s)

      expect(Chat.where(connector_id: connector.id, external_id: "5531971810932").take.user_name).to eq("Maria")
    end

    it "zapi, no evento pedido" do
      connector = create(:connector_whatsapp_web, :zapi, organization: organization)

      described_class.perform_now("zapi", { messageId: "Z1", phone: "5531971810932", senderName: "Ana", text: { message: "Oi" } }.to_json, connector.id.to_s, "on_message_received")

      expect(Chat.where(connector_id: connector.id, external_id: "5531971810932").exists?).to be(true)
    end

    it "zapi, na desconexão" do
      connector = create(:connector_whatsapp_web, :zapi, organization: organization)

      described_class.perform_now("zapi", { error: "x" }.to_json, connector.id.to_s, "on_whatsapp_disconnected")

      expect(connector.reload.status).to eq(:closed)
    end

    it "zapi, no conector próprio" do
      connector = create(:connector_zapi, organization: organization)

      described_class.perform_now("zapi", { error: "x" }.to_json, connector.id.to_s, "on_whatsapp_disconnected")

      expect(connector.reload.status).to eq(:closed)
    end

    it "evolution, pelo nome da instância" do
      connector = create(:connector_whatsapp_web, organization: organization)
      body = { event: "messages.upsert", data: { key: { remoteJid: "5531971810932@s.whatsapp.net", id: "E1", fromMe: false }, message: { conversation: "Oi" } } }.to_json

      described_class.perform_now("evolution", body, "IWA-#{connector.id}")

      expect(Chat.where(connector_id: connector.id, external_id: "5531971810932").exists?).to be(true)
    end

    it "meta_messaging, sem conector: quem diz é a entrada" do
      connector = create(:connector_messenger, organization: organization)
      body = { object: "page", entry: [ { id: connector.page_id, messaging: [ { sender: { id: "PSID" }, message: { mid: "m1", text: "Oi" } } ] } ] }.to_json

      described_class.perform_now("meta_messaging", body)

      expect(Chat.where(connector_id: connector.id, external_id: "PSID").exists?).to be(true)
    end

    it "lead_chat" do
      connector = create(:connector_lead_chat, organization: organization)
      stub_request(:get, %r{/chat/v1/session/S1}).to_return(
        status: 200,
        body: { contactDetails: { id: "C1", name: "Pedro", phonenumber: "+5531971810932" }, channelDetails: {}, agentDetails: {} }.to_json
      )

      described_class.perform_now("lead_chat", { eventType: "MESSAGE_RECEIVED", content: { id: "L1", type: "TEXT", text: "Oi", sessionId: "S1" } }.to_json, connector.id.to_s)

      expect(Chat.where(connector_id: connector.id, external_id: "5531971810932").exists?).to be(true)
    end
  end

  describe "o que não acha destino" do
    let(:body) { { messageId: "Z1", phone: "5531971810932", text: { message: "Oi" } }.to_json }

    after { expect(Chat.count).to eq(0) }

    it "whatsapp_cloud com conector que não existe" do
      described_class.perform_now("whatsapp_cloud", "{}", BSON::ObjectId.new.to_s)
    end

    it "zapi com conector que não existe" do
      described_class.perform_now("zapi", body, BSON::ObjectId.new.to_s, "on_message_received")
    end

    it "zapi com conector de outro tipo" do
      cloud = create(:connector_whatsapp_cloud, organization: organization)

      described_class.perform_now("zapi", body, cloud.id.to_s, "on_message_received")
    end

    it "evolution com instância que não é nossa" do
      described_class.perform_now("evolution", { event: "messages.upsert" }.to_json, "OUTRA-123")
    end

    it "lead_chat com conector que não existe" do
      described_class.perform_now("lead_chat", "{}", BSON::ObjectId.new.to_s)
    end

    it "provedor desconhecido só vai para o log" do
      allow(Rails.logger).to receive(:warn)

      described_class.perform_now("telegram", "{}")

      expect(Rails.logger).to have_received(:warn).with(a_string_including("Provedor desconhecido: telegram"))
    end
  end

  describe "o corpo" do
    let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }

    [ "", nil, "[1, 2]", "\"texto\"" ].each do |body|
      it "#{body.inspect} não quebra" do
        expect { described_class.perform_now("whatsapp_cloud", body, connector.id.to_s) }.not_to raise_error
        expect(described_class).not_to have_been_enqueued
      end
    end

    it "JSON inválido tenta 3 vezes e desiste, com log" do
      allow(Rails.logger).to receive(:error)

      expect {
        perform_enqueued_jobs(only: described_class) { described_class.perform_later("whatsapp_cloud", "{inválido", connector.id.to_s) }
      }.not_to raise_error

      expect(Rails.logger).to have_received(:error).with(a_string_including("JSON::ParserError"))
    end
  end

  describe "erro no processamento" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization) }
    let(:body) { { event: "messages.upsert", data: { key: { remoteJid: "5531971810932@s.whatsapp.net", id: "E1", fromMe: false }, message: { conversation: "Oi" } } }.to_json }

    def chat
      Chat.where(connector_id: connector.id, external_id: "5531971810932").take
    end

    it "agenda nova tentativa, em vez de levantar" do
      allow(Chats::Locator).to receive(:find_or_create).and_raise(StandardError, "mongo fora")

      expect { described_class.perform_now("evolution", body, "IWA-#{connector.id}") }.to have_enqueued_job(described_class)
    end

    it "desiste depois de 3 tentativas, com o provedor e o erro no log" do
      allow(Chats::Locator).to receive(:find_or_create).and_raise(StandardError, "mongo fora")
      allow(Rails.logger).to receive(:error)

      expect {
        perform_enqueued_jobs(only: described_class) { described_class.perform_later("evolution", body, "IWA-#{connector.id}") }
      }.not_to raise_error

      expect(Chats::Locator).to have_received(:find_or_create).exactly(3).times
      expect(Rails.logger).to have_received(:error).with(a_string_matching(/ProcessWebhookJob.*evolution.*mongo fora/))
    end

    it "a nova tentativa grava a mensagem, uma vez só" do
      attempts = 0
      allow(ChatMessage::Text).to receive(:create!).and_wrap_original do |original, *args, **options|
        attempts += 1
        raise StandardError, "mongo fora" if attempts == 1

        original.call(*args, **options)
      end

      perform_enqueued_jobs(only: described_class) { described_class.perform_later("evolution", body, "IWA-#{connector.id}") }

      expect(messages_of(chat).pluck(:message_id)).to eq([ "E1" ])
      expect(Flows::InboundDispatcher).to have_received(:call).once
    end
  end

  # A Meta agrupa eventos: se o segundo falha, a nova tentativa refaz o primeiro.
  describe "webhook com várias mensagens" do
    it "o que já passou não duplica na nova tentativa" do
      connector = create(:connector_whatsapp_cloud, organization: organization)
      body = {
        entry: [ { id: connector.waba_id.to_s, changes: [ { value: {
          metadata: { phone_number_id: connector.phone_number_id.to_s },
          contacts: [ { wa_id: "5531971810932", profile: { name: "Maria" } } ],
          messages: [
            { id: "wamid.1", from: "5531971810932", type: "text", text: { body: "Primeira" } },
            { id: "wamid.2", from: "5531971810932", type: "text", text: { body: "Segunda" } }
          ]
        } } ] } ]
      }.to_json

      attempts = 0
      allow(ChatMessage::Text).to receive(:create!).and_wrap_original do |original, *args, **options|
        attempts += 1
        raise StandardError, "mongo fora" if attempts == 2

        original.call(*args, **options)
      end

      perform_enqueued_jobs(only: described_class) { described_class.perform_later("whatsapp_cloud", body, connector.id.to_s) }

      chat = Chat.where(connector_id: connector.id).take
      expect(messages_of(chat).pluck(:message_id)).to contain_exactly("wamid.1", "wamid.2")
      expect(Flows::InboundDispatcher).to have_received(:call).twice
    end
  end
end
