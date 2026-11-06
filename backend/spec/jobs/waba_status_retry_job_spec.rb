require "rails_helper"

RSpec.describe WabaStatusRetryJob do
  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }
  let(:phone_number_id) { connector.phone_number_id.to_s }
  let(:wamid) { "wamid.HBgMNTUzMTcxODEwOTMyFQIAERgSMTQ0OTJEMzREQzVFOUEwOUY4AA==" }
  let(:status) { { "id" => wamid, "status" => "read", "recipient_id" => "553171810932" } }
  let(:chat) { create(:chat, connector: connector, external_id: "5531971810932") }

  describe "#perform" do
    it "aplica o status quando a mensagem já chegou no banco" do
      message = create(:chat_text_message, chat: chat, role: "assistant", message_id: wamid, status: "delivery_ack")

      described_class.perform_now(connector.id.to_s, status, phone_number_id, 1)

      expect(message.reload.status).to eq("read")
    end

    it "passa o contador adiante para o atraso avançar" do
      chat

      expect { described_class.perform_now(connector.id.to_s, status, phone_number_id, 1) }
        .to have_enqueued_job(described_class).with(connector.id.to_s, status, phone_number_id, 2)
    end

    it "para quando as tentativas acabam" do
      chat
      attempts = WabaStatusUpdateService::RETRY_DELAYS.size

      expect { described_class.perform_now(connector.id.to_s, status, phone_number_id, attempts) }
        .not_to have_enqueued_job(described_class)
    end

    # O conector pode ter sido removido entre o webhook e a tentativa; levantar só encheria a
    # fila de mortos sem nada a fazer.
    it "engole o conector que não existe mais" do
      expect { described_class.perform_now(BSON::ObjectId.new.to_s, status, phone_number_id, 1) }.not_to raise_error
    end

    it "só aceita conector da WABA" do
      other = create(:connector_whatsapp_web, organization: organization)

      expect { described_class.perform_now(other.id.to_s, status, phone_number_id, 1) }.not_to have_enqueued_job(described_class)
    end

    it "é idempotente: reexecutar não regride o que já avançou" do
      message = create(:chat_text_message, chat: chat, role: "assistant", message_id: wamid, status: "read")

      described_class.perform_now(connector.id.to_s, status.merge("status" => "sent"), phone_number_id, 1)

      expect(message.reload.status).to eq("read")
    end
  end

  describe "fila" do
    it "é a default" do
      expect(described_class.new.queue_name).to eq("default")
    end

    # O atraso é do serviço (RETRY_DELAYS), não do Sidekiq: a nova tentativa nativa ligada
    # duplicaria as tentativas.
    it "desliga a nova tentativa nativa" do
      expect(described_class.get_sidekiq_options["retry"]).to be(false)
    end
  end
end
