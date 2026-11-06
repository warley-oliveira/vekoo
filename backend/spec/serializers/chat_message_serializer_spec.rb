require "rails_helper"

RSpec.describe ChatMessageSerializer do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }
  let(:chat) { create(:chat, organization: organization) }
  let(:moment) { Time.utc(2026, 11, 6, 12, 0, 0) }
  let(:moment_ms) { moment.to_i * 1000 }

  around { |example| travel_to(moment) { example.run } }

  describe "mensagem de texto" do
    let(:message) do
      create(
        :chat_text_message,
        chat: chat,
        role: "assistant",
        content: "Olá",
        message_id: "OUT-1",
        message_origin: "frontend",
        sender_name: "Alice Prado",
        account_id: "conta-1",
        status: "read",
        status_message: nil,
        reply_to_message_id: "citada-1",
        context_message: { "stanzaId" => "x" },
        campaign_id: "camp-1"
      )
    end

    it "traz cada campo em camelCase" do
      expect(described_class.one(message)).to include(
        id: message.id.to_s,
        chatId: chat.id.to_s,
        role: "assistant",
        typeElement: "text",
        content: "Olá",
        messageId: "OUT-1",
        messageOrigin: "frontend",
        senderName: "Alice Prado",
        accountId: "conta-1",
        status: "read",
        statusMessage: nil,
        replyToMessageId: "citada-1",
        contextMessage: { "stanzaId" => "x" },
        hasSpan: false,
        isSpan: false,
        campaignId: "camp-1",
        createdAt: moment_ms
      )
    end

    it "campos de mídia ficam nil, e não quebram" do
      expect(described_class.one(message)).to include(caption: nil, mediaType: nil, mediaUrl: nil, audioUrl: nil, mediaProperties: nil)
    end

    it "só tem chaves em camelCase" do
      expect(described_class.one(message).keys.map(&:to_s)).to all(match(/\A[a-z][a-zA-Z]*\z/))
    end
  end

  describe "mensagem de imagem" do
    it "usa a image_url como mediaUrl" do
      message = create(:chat_image_message, chat: chat, image_url: "/foto.jpg", caption: "Legenda")

      expect(described_class.one(message)).to include(typeElement: "image", mediaUrl: "/foto.jpg", mediaType: "image", caption: "Legenda")
    end
  end

  describe "mensagem de mídia" do
    it "traz o tipo, a URL e as propriedades" do
      message = create(:chat_media_message, chat: chat, media_type: "document", media_url: "/doc.pdf", media_properties: { "fileName" => "doc.pdf" })

      expect(described_class.one(message)).to include(typeElement: "media", mediaType: "document", mediaUrl: "/doc.pdf", mediaProperties: { "fileName" => "doc.pdf" })
    end
  end

  describe "mensagem de áudio" do
    it "traz a URL nos dois campos" do
      message = create(:chat_audio_message, chat: chat, audio_url: "/a.ogg")

      expect(described_class.one(message)).to include(typeElement: "audio", mediaUrl: "/a.ogg", audioUrl: "/a.ogg")
    end
  end

  describe "nota do histórico" do
    it "traz o tipo da nota" do
      message = create(:chat_text_message, chat: chat, role: "base", role_base_type: "assigned-user-notation", content: "Nota")

      expect(described_class.one(message)).to include(role: "base", roleBaseType: "assigned-user-notation", content: "Nota")
    end

    it "traz os dados do anúncio em camelCase" do
      message = create(
        :chat_text_message,
        chat: chat,
        role: "base",
        role_base_type: "instagram-ad-greeting",
        external_ad_reply: { "source_app" => "instagram", "thumbnail_url" => "https://x/y.jpg", "nested_data" => { "ctwa_clid" => "abc" } }
      )

      expect(described_class.one(message)[:externalAdReply]).to eq(
        "sourceApp" => "instagram", "thumbnailUrl" => "https://x/y.jpg", "nestedData" => { "ctwaClid" => "abc" }
      )
    end

    it "sem anúncio, fica nil" do
      expect(described_class.one(create(:chat_text_message, chat: chat))[:externalAdReply]).to be_nil
    end
  end

  describe "mensagem apagada" do
    it "traz quando e para quem" do
      message = create(:chat_text_message, chat: chat, deleted_at: moment, deleted_scope: "everyone")

      expect(described_class.one(message)).to include(deletedAt: moment_ms, deletedScope: "everyone")
    end

    it "sem apagar, os dois ficam nil" do
      expect(described_class.one(create(:chat_text_message, chat: chat))).to include(deletedAt: nil, deletedScope: nil)
    end
  end

  describe "partes" do
    it "traz has_span e is_span" do
      original = create(:chat_text_message, chat: chat, has_span: true)
      part = create(:chat_text_message, chat: chat, is_span: true)

      expect(described_class.one(original)).to include(hasSpan: true, isSpan: false)
      expect(described_class.one(part)).to include(hasSpan: false, isSpan: true)
    end
  end

  describe "mensagem aguardando conteúdo" do
    it "traz missing_message" do
      expect(described_class.one(create(:chat_text_message, chat: chat, missing_message: true))).to include(missingMessage: true)
    end
  end

  describe ".reactions" do
    let(:message) { create(:chat_text_message, chat: chat) }

    it "traz cada reação em camelCase, com a data em milissegundos" do
      message.update!(reactions: message.apply_reaction("👍", from: "assistant", sender_name: "Alice Prado", account_id: "conta-1"))

      expect(described_class.reactions(message.reload)).to eq(
        [ { emoji: "👍", from: "assistant", senderName: "Alice Prado", accountId: "conta-1", reactedAt: moment_ms } ]
      )
    end

    it "omite o que está vazio" do
      message.set(reactions: [ { "emoji" => "❤️", "from" => "user" } ])

      expect(described_class.reactions(message)).to eq([ { emoji: "❤️", from: "user" } ])
    end

    it "aceita chaves símbolo" do
      expect(described_class.reactions(ChatMessage::Text.new(reactions: [ { emoji: "👍", from: "user" } ]))).to eq([ { emoji: "👍", from: "user" } ])
    end

    it "sem reações, devolve lista vazia" do
      expect(described_class.reactions(message)).to eq([])
    end

    it "entra no payload da mensagem" do
      message.set(reactions: [ { "emoji" => "❤️", "from" => "user" } ])

      expect(described_class.one(message)[:reactions]).to eq([ { emoji: "❤️", from: "user" } ])
    end
  end

  it ".many serializa a lista" do
    messages = [ create(:chat_text_message, chat: chat), create(:chat_audio_message, chat: chat) ]

    expect(described_class.many(messages).map { |item| item[:typeElement] }).to eq(%w[text audio])
  end
end
