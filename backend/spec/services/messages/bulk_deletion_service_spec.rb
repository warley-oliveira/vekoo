require "rails_helper"

RSpec.describe Messages::BulkDeletionService do
  subject(:service) { described_class.new(chat: chat, message_ids: messages.map(&:id)) }

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:chat) { create(:chat, connector: connector, external_id: "5511999999999@s.whatsapp.net") }
  let(:stream) { ChatMessage::Base.stream_for(chat) }
  let(:messages) { [ outgoing, outgoing ] }

  def outgoing(**attributes)
    create(:chat_text_message, chat: chat, role: "assistant", **attributes)
  end

  def stored(message)
    ChatMessage::Base.unscoped.where(chat_id: message.chat_id, id: message.id).take
  end

  describe "apagar só daqui" do
    it "apaga do banco sem tocar no provedor" do
      result = service.call

      expect(a_request(:any, /.*/)).not_to have_been_made
      expect(result).to be_success
      expect(result.deleted_ids).to match_array(messages.map { |message| message.id.to_s })
      expect(messages.map { |message| stored(message) }).to all(be_nil)
    end

    it "transmite messages_deleted com os ids" do
      expect { service.call }.to have_broadcasted_to(stream).with(
        "event" => "messages_deleted",
        "messageIds" => messages.map { |message| message.id.to_s }
      )
    end

    it "apaga junto o arquivo da mensagem" do
      blob = ActiveStorage::Blob.create_and_upload!(io: StringIO.new("fake"), filename: "foto.jpg", content_type: "image/jpeg")
      media = create(:chat_image_message, chat: chat, media_blob_id: blob.id)

      expect { described_class.new(chat: chat, message_ids: [ media.id ]).call }
        .to have_enqueued_job(ActiveStorage::PurgeJob).with(blob)
    end

    it "alcança partes e notas, que ficam fora do default_scope" do
      part = outgoing(is_span: true)
      note = outgoing(role: "base", role_base_type: "context-clear", content: "nota")

      described_class.new(chat: chat, message_ids: [ part.id, note.id ]).call

      expect(stored(part)).to be_nil
      expect(stored(note)).to be_nil
    end
  end

  describe "em qualquer canal" do
    shared_examples "apaga do banco" do
      it "apaga do banco" do
        result = service.call

        expect(result).to be_success
        expect(messages.map { |message| stored(message) }).to all(be_nil)
      end
    end

    context "com a WABA" do
      let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }

      it_behaves_like "apaga do banco"
    end

    context "com a AIVA" do
      let(:connector) { create(:connector_whatsapp_web, :aiva, organization: organization) }

      it_behaves_like "apaga do banco"
    end

    context "com o widget do site" do
      let(:connector) { create(:connector_web_widget, organization: organization) }

      it_behaves_like "apaga do banco"
    end

    context "com a conversa sem conector" do
      let(:chat) { create(:chat, organization: organization) }

      it_behaves_like "apaga do banco"
    end
  end

  describe "sem ids" do
    it "falha" do
      result = described_class.new(chat: chat, message_ids: []).call

      expect(result).not_to be_success
      expect(result.errors).to include(I18n.t("connectors.messages.none_given"))
    end

    it "aceita nil como lista vazia" do
      expect(described_class.new(chat: chat, message_ids: nil).call.errors).to include(I18n.t("connectors.messages.none_given"))
    end
  end

  describe "ids que não existem" do
    it "falha" do
      result = described_class.new(chat: chat, message_ids: [ BSON::ObjectId.new.to_s ]).call

      expect(result).not_to be_success
      expect(result.errors).to include(I18n.t("connectors.messages.none_found"))
    end
  end

  describe "sem conversa" do
    it "falha" do
      result = described_class.new(chat: nil, message_ids: [ "qualquer" ]).call

      expect(result).not_to be_success
      expect(result.errors).to include(I18n.t("connectors.messages.chat_not_found"))
    end
  end

  describe "isolamento" do
    let(:other_chat) { create(:chat, organization: create(:organization)) }
    let(:foreign) { create(:chat_text_message, chat: other_chat, role: "assistant") }

    it "não alcança mensagem de outra conversa" do
      own = outgoing

      result = described_class.new(chat: chat, message_ids: [ own.id, foreign.id ]).call

      expect(result.deleted_ids).to eq([ own.id.to_s ])
      expect(stored(foreign)).to be_present
    end

    it "só com ids de fora, falha sem apagar nada" do
      result = described_class.new(chat: chat, message_ids: [ foreign.id ]).call

      expect(result.errors).to include(I18n.t("connectors.messages.none_found"))
      expect(stored(foreign)).to be_present
    end
  end
end
