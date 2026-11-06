require "rails_helper"

RSpec.describe Messages::BulkDeletionService do
  subject(:service) { described_class.new(chat: chat, message_ids: messages.map(&:id), scope: scope) }

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, :zapi, organization: organization) }
  let(:chat) { create(:chat, connector: connector, external_id: "5511999999999@s.whatsapp.net") }
  let(:stream) { ChatMessage::Base.stream_for(chat) }
  let(:zapi_delete_url) { "https://api.z-api.io/instances/INST123/token/TOKABC/messages" }
  let(:messages) { [ outgoing, outgoing ] }

  def outgoing(**attributes)
    create(:chat_text_message, chat: chat, role: "assistant", **attributes)
  end

  def stored(message)
    ChatMessage::Base.unscoped.where(chat_id: message.chat_id, id: message.id).take
  end

  def stub_revoke(message_id, status: 200)
    stub_request(:delete, zapi_delete_url)
      .with(query: { "messageId" => message_id, "phone" => "5511999999999", "owner" => "true" })
      .to_return(status: status, body: "")
  end

  def stub_all_revokes(status: 200)
    stub_request(:delete, zapi_delete_url).with(query: hash_including({})).to_return(status: status, body: "")
  end

  def a_revoke(message_id)
    a_request(:delete, zapi_delete_url).with(query: hash_including("messageId" => message_id))
  end

  describe "só para mim (scope me)" do
    let(:scope) { "me" }

    it "apaga do banco sem tocar no provedor" do
      result = service.call

      expect(a_request(:delete, /z-api/)).not_to have_been_made
      expect(result).to be_success
      expect(result.scope_applied).to eq("me")
      expect(result.deleted_ids).to match_array(messages.map { |message| message.id.to_s })
      expect(result.revoked_ids).to be_empty
      expect(messages.map { |message| stored(message) }).to all(be_nil)
    end

    it "transmite messages_deleted com scope me" do
      expect { service.call }.to have_broadcasted_to(stream).with(
        "event" => "messages_deleted",
        "messageIds" => messages.map { |message| message.id.to_s },
        "scope" => "me"
      )
    end

    it "apaga junto o arquivo da mensagem" do
      blob = ActiveStorage::Blob.create_and_upload!(io: StringIO.new("fake"), filename: "foto.jpg", content_type: "image/jpeg")
      media = create(:chat_image_message, chat: chat, media_blob_id: blob.id)

      expect { described_class.new(chat: chat, message_ids: [ media.id ], scope: "me").call }
        .to have_enqueued_job(ActiveStorage::PurgeJob).with(blob)
    end

    it "alcança partes e notas, que ficam fora do default_scope" do
      part = outgoing(is_span: true)
      note = outgoing(role: "base", role_base_type: "context-clear", content: "nota")

      described_class.new(chat: chat, message_ids: [ part.id, note.id ], scope: "me").call

      expect(stored(part)).to be_nil
      expect(stored(note)).to be_nil
    end
  end

  describe "para todos (scope everyone), tudo elegível" do
    let(:scope) { "everyone" }

    it "revoga cada uma na Z-API e apaga localmente sem destruir" do
      revokes = messages.map { |message| stub_revoke(message.message_id) }

      result = service.call

      expect(revokes).to all(have_been_requested)
      expect(result).to be_success
      expect(result.scope_applied).to eq("everyone")
      expect(result.revoked_ids).to match_array(messages.map { |message| message.id.to_s })
      expect(result.deleted_ids).to match_array(messages.map { |message| message.id.to_s })

      messages.each do |message|
        expect(stored(message)).to have_attributes(deleted_at: kind_of(Time), deleted_scope: "everyone")
      end
    end

    it "transmite messages_deleted com scope everyone" do
      stub_all_revokes

      expect { service.call }.to have_broadcasted_to(stream).with(
        a_hash_including("event" => "messages_deleted", "scope" => "everyone")
      )
    end
  end

  describe "para todos, com uma mensagem fora da janela de 60 horas" do
    let(:scope) { "everyone" }
    let(:expired) { outgoing(original_created_at: 61.hours.ago, created_at: 61.hours.ago) }
    let(:messages) { [ outgoing, expired ] }

    it "chama a Z-API para todas e apaga todas, sem cair para só para mim" do
      stub_all_revokes

      result = service.call

      messages.each { |message| expect(a_revoke(message.message_id)).to have_been_made.once }
      expect(result.scope_applied).to eq("everyone")
      expect(stored(expired).deleted_scope).to eq("everyone")
    end
  end

  describe "para todos, com uma mensagem recebida" do
    let(:scope) { "everyone" }
    let(:incoming) { create(:chat_text_message, chat: chat, role: "user") }
    let(:ours) { outgoing }
    let(:messages) { [ ours, incoming ] }

    it "pula a Z-API na recebida e apaga as duas" do
      stub_all_revokes

      result = service.call

      expect(a_revoke(ours.message_id)).to have_been_made.once
      expect(a_revoke(incoming.message_id)).not_to have_been_made
      expect(result.scope_applied).to eq("everyone")
      expect(result.revoked_ids).to eq([ ours.id.to_s ])
      expect(stored(incoming).deleted_scope).to eq("everyone")
    end
  end

  describe "para todos, num canal que não revoga" do
    let(:scope) { "everyone" }

    shared_examples "cai para só para mim" do
      it "apaga do banco" do
        result = service.call

        expect(result).to be_success
        expect(result.scope_applied).to eq("me")
        expect(result.revoked_ids).to be_empty
        expect(messages.map { |message| stored(message) }).to all(be_nil)
      end

      it "transmite com o escopo que valeu" do
        expect { service.call }.to have_broadcasted_to(stream).with(a_hash_including("scope" => "me"))
      end
    end

    context "com a WABA" do
      let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }

      it_behaves_like "cai para só para mim"
    end

    context "com a Evolution" do
      let(:connector) { create(:connector_whatsapp_web, organization: organization) }

      it_behaves_like "cai para só para mim"
    end

    context "com o widget do site" do
      let(:connector) { create(:connector_web_widget, organization: organization) }

      it_behaves_like "cai para só para mim"
    end

    context "com a conversa sem conector" do
      let(:chat) { create(:chat, organization: organization) }

      it_behaves_like "cai para só para mim"
    end
  end

  describe "para todos, com mensagem sem id no provedor" do
    let(:scope) { "everyone" }
    let(:ours) { outgoing }
    let(:without_id) { outgoing(message_id: nil) }
    let(:messages) { [ ours, without_id ] }

    it "pula a Z-API na que não tem id e apaga as duas" do
      stub_all_revokes

      result = service.call

      expect(a_request(:delete, zapi_delete_url).with(query: hash_including({}))).to have_been_made.once
      expect(result.scope_applied).to eq("everyone")
      expect(stored(without_id).deleted_scope).to eq("everyone")
    end
  end

  describe "para todos, com a Z-API falhando" do
    let(:scope) { "everyone" }

    it "com erro HTTP, ainda apaga localmente e devolve sucesso" do
      stub_all_revokes(status: 500)

      result = service.call

      expect(result).to be_success
      expect(result.scope_applied).to eq("everyone")
      expect(result.revoked_ids).to be_empty
      messages.each { |message| expect(stored(message).deleted_scope).to eq("everyone") }
    end

    it "fora do ar, ainda apaga localmente e devolve sucesso" do
      stub_request(:delete, /z-api/).to_timeout

      result = service.call

      expect(result).to be_success
      expect(result.revoked_ids).to be_empty
    end

    it "conta como revogada só a que passou" do
      first, second = messages
      stub_revoke(first.message_id)
      stub_revoke(second.message_id, status: 500)

      expect(service.call.revoked_ids).to eq([ first.id.to_s ])
    end
  end

  describe "sem ids" do
    it "falha" do
      result = described_class.new(chat: chat, message_ids: [], scope: "me").call

      expect(result).not_to be_success
      expect(result.errors).to include(I18n.t("connectors.messages.none_given"))
    end

    it "aceita nil como lista vazia" do
      expect(described_class.new(chat: chat, message_ids: nil, scope: "me").call.errors).to include(I18n.t("connectors.messages.none_given"))
    end
  end

  describe "ids que não existem" do
    it "falha" do
      result = described_class.new(chat: chat, message_ids: [ BSON::ObjectId.new.to_s ], scope: "me").call

      expect(result).not_to be_success
      expect(result.errors).to include(I18n.t("connectors.messages.none_found"))
    end
  end

  describe "sem conversa" do
    it "falha" do
      result = described_class.new(chat: nil, message_ids: [ "qualquer" ], scope: "me").call

      expect(result).not_to be_success
      expect(result.errors).to include(I18n.t("connectors.messages.chat_not_found"))
    end
  end

  describe "isolamento" do
    let(:other_chat) { create(:chat, organization: create(:organization)) }
    let(:foreign) { create(:chat_text_message, chat: other_chat, role: "assistant") }

    it "não alcança mensagem de outra conversa" do
      own = outgoing

      result = described_class.new(chat: chat, message_ids: [ own.id, foreign.id ], scope: "me").call

      expect(result.deleted_ids).to eq([ own.id.to_s ])
      expect(stored(foreign)).to be_present
    end

    it "só com ids de fora, falha sem apagar nada" do
      result = described_class.new(chat: chat, message_ids: [ foreign.id ], scope: "me").call

      expect(result.errors).to include(I18n.t("connectors.messages.none_found"))
      expect(stored(foreign)).to be_present
    end
  end

  it "aceita o escopo como símbolo" do
    expect(described_class.new(chat: chat, message_ids: [ outgoing.id ], scope: :me).call.scope_applied).to eq("me")
  end
end
