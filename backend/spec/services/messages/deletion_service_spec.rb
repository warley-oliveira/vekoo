require "rails_helper"

RSpec.describe Messages::DeletionService do
  include ActiveSupport::Testing::TimeHelpers

  subject(:service) { described_class.new(message: message) }

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, :zapi, organization: organization) }
  let(:chat) { create(:chat, connector: connector, external_id: "5511999999999@s.whatsapp.net") }
  let(:message_attributes) { {} }
  let(:message) { create(:chat_text_message, chat: chat, role: "assistant", message_id: "ZAPI_MSG_ABC", **message_attributes) }
  let(:zapi_delete_url) { "https://api.z-api.io/instances/INST123/token/TOKABC/messages" }

  def stub_revoke(message_id: "ZAPI_MSG_ABC", status: 200)
    stub_request(:delete, zapi_delete_url)
      .with(query: { "messageId" => message_id, "phone" => "5511999999999", "owner" => "true" })
      .to_return(status: status, body: "", headers: {})
  end

  describe "mensagem nossa, na Z-API, dentro da janela" do
    it "revoga no provedor com telefone, id e owner, e apaga localmente" do
      revoke = stub_revoke

      result = service.call

      expect(revoke).to have_been_requested
      expect(result).to be_success
      expect(message.reload.deleted_at).to be_present
      expect(message.deleted_scope).to eq("everyone")
    end

    it "mantém o documento: a tela mostra o aviso de mensagem apagada" do
      stub_revoke

      service.call

      expect(ChatMessage::Base.unscoped.where(chat_id: chat.id, id: message.id).exists?).to be(true)
    end

    it "transmite a mudança na stream da conversa" do
      stub_revoke
      message

      expect { service.call }.to have_broadcasted_to(ChatMessage::Base.stream_for(chat)).with(
        a_hash_including("id" => message.id.to_s, "deletedScope" => "everyone")
      )
    end
  end

  describe "mensagem recebida do contato (role user)" do
    let(:message) { create(:chat_text_message, chat: chat, role: "user", message_id: "ZAPI_MSG_ABC") }

    it "não chama o provedor, só apaga localmente" do
      expect(service.call).to be_success

      expect(a_request(:delete, /z-api/)).not_to have_been_made
      expect(message.reload.deleted_scope).to eq("everyone")
    end
  end

  describe "mensagem já apagada" do
    let(:deleted_at) { 1.hour.ago.change(usec: 0) }
    let(:message_attributes) { { deleted_at: deleted_at, deleted_scope: "everyone" } }

    it "devolve sucesso sem tocar no provedor nem no registro" do
      expect(service.call).to be_success

      expect(a_request(:delete, /z-api/)).not_to have_been_made
      expect(message.reload.deleted_at).to eq(deleted_at)
    end
  end

  describe "janela de 60 horas" do
    context "passada a janela" do
      let(:message_attributes) { { original_created_at: 61.hours.ago, created_at: 61.hours.ago } }

      it "falha sem chamar o provedor e sem apagar" do
        result = service.call

        expect(result).not_to be_success
        expect(result.errors).to include(I18n.t("connectors.messages.delete_window_expired"))
        expect(a_request(:delete, /z-api/)).not_to have_been_made
        expect(message.reload.deleted_at).to be_nil
      end
    end

    context "ainda dentro da janela" do
      let(:message_attributes) { { original_created_at: 59.hours.ago, created_at: 59.hours.ago } }

      it "apaga" do
        stub_revoke

        expect(service.call).to be_success
      end
    end

    it "vale a data original do provedor, e não a da gravação" do
      message.set(original_created_at: 61.hours.ago)

      expect(service.call).not_to be_success
    end

    it "sem data original, vale a data de criação" do
      message.set(original_created_at: nil, created_at: 61.hours.ago)

      expect(described_class.new(message: ChatMessage::Base.unscoped.where(chat_id: chat.id, id: message.id).take).call).not_to be_success
    end

    it "mensagem recebida também respeita a janela" do
      incoming = create(:chat_text_message, chat: chat, role: "user", original_created_at: 61.hours.ago)

      expect(described_class.new(message: incoming).call).not_to be_success
    end
  end

  describe "só a Z-API revoga" do
    shared_examples "canal que não revoga" do
      it "recusa com o aviso de canal sem suporte" do
        result = service.call

        expect(result).not_to be_success
        expect(result.errors).to include(I18n.t("connectors.messages.delete_unsupported"))
        expect(message.reload.deleted_at).to be_nil
      end
    end

    context "com a WABA" do
      let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }

      it_behaves_like "canal que não revoga"
    end

    context "com a Evolution" do
      let(:connector) { create(:connector_whatsapp_web, organization: organization) }

      it_behaves_like "canal que não revoga"
    end

    context "com o Instagram" do
      let(:connector) { create(:connector_instagram, organization: organization) }

      it_behaves_like "canal que não revoga"
    end

    context "com a instância Z-API avulsa, que nunca teve revogação" do
      let(:connector) { create(:connector_zapi, organization: organization) }

      it_behaves_like "canal que não revoga"
    end
  end

  describe "mensagem sem id no provedor" do
    let(:message) { create(:chat_text_message, chat: chat, role: "assistant", message_id: nil) }

    it "não chama o provedor, mas apaga localmente" do
      expect(service.call).to be_success

      expect(a_request(:delete, /z-api/)).not_to have_been_made
      expect(message.reload.deleted_at).to be_present
    end
  end

  describe "conversa sem conector" do
    let(:chat) { create(:chat, organization: organization) }

    it "recusa" do
      result = service.call

      expect(result).not_to be_success
      expect(result.errors).to include(I18n.t("connectors.messages.connector_not_found"))
    end
  end

  describe "quando a Z-API falha" do
    it "com erro HTTP, falha sem apagar localmente" do
      stub_revoke(status: 500)

      result = service.call

      expect(result).not_to be_success
      expect(result.errors).to include(I18n.t("connectors.messages.delete_failed"))
      expect(message.reload.deleted_at).to be_nil
    end

    it "com recusa do provedor, falha sem apagar localmente" do
      stub_revoke(status: 400)

      expect(service.call).not_to be_success
      expect(message.reload.deleted_at).to be_nil
    end

    it "fora do ar, falha sem apagar localmente" do
      stub_request(:delete, /z-api/).to_timeout

      result = service.call

      expect(result).not_to be_success
      expect(result.errors).to include(I18n.t("connectors.messages.delete_failed"))
      expect(message.reload.deleted_at).to be_nil
    end
  end

  it "devolve a mensagem no resultado" do
    stub_revoke

    expect(service.call.message).to eq(message)
  end
end
