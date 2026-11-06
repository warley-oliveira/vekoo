# Imagem, vídeo ou documento recebido de um canal: baixa do provedor, guarda aqui, cria a
# mensagem e segue para `Chats::InboundFlow`. A descrição da imagem por IA, que alimentava o
# assistente, saiu junto com ele: o `content` é a legenda.
class ImageMessageJob < ApplicationJob
  queue_as :critical

  VALID_MEDIA_PROPERTIES = %w[width height seconds fileLength fileName mimeType].freeze

  # Link de provedor falha de vez em quando. Esgotadas as tentativas, fica uma nota na
  # conversa: a pessoa precisa saber que chegou algo que não deu para abrir.
  retry_on StandardError, wait: :polynomially_longer, attempts: 3 do |job, error|
    job.register_failure(error)
  end

  # @param media_reference [String] URL ou id de mídia do provedor
  # @param properties_json [String] mimetype/mime_type, caption, fileName...
  # @param raw_json [String] o trecho do webhook, para quem baixa pelo payload (WhatsApp Web)
  def perform(chat_id, organization_id, media_reference, message_id, from_me = false, properties_json = nil, raw_json = nil)
    chat = Chat.scoped(organization_id, chat_id)
    return unless chat
    return if message_id.present? && ChatMessage::Base.unscoped.where(chat_id: chat.id, message_id: message_id).exists?

    properties = parse(properties_json)
    download = Inbound::MediaDownload.media(chat.connector, media_reference, message_id: message_id, properties: properties, raw: parse(raw_json))
    raise "Media not retrieved for message #{message_id}" if download.path.blank?

    blob = store(download, message_id, properties)

    first_message = !ChatMessage::Base.where(chat_id: chat.id).exists?
    message = build_message(chat, blob, message_id, from_me, properties, download)
    message.save!

    Chats::InboundFlow.call(chat: chat, message: message, text: properties[:caption].to_s, first_message: first_message, from_me: from_me)
  ensure
    Inbound::MediaDownload.cleanup(download&.path)
  end

  def register_failure(error)
    chat_id, organization_id = arguments
    Rails.logger.error("[ImageMessageJob] #{error.class}: #{error.message} chat=#{chat_id}")

    chat = Chat.scoped(organization_id, chat_id)
    return unless chat

    ChatMessage::Text.create(role: "base", role_base_type: "error", content: I18n.t("connectors.notes.media_failed"), chat: chat)
  end

  private

  def parse(json)
    return {}.with_indifferent_access if json.blank?

    parsed = JSON.parse(json)
    parsed.is_a?(Hash) ? parsed.with_indifferent_access : {}.with_indifferent_access
  rescue JSON::ParserError
    {}.with_indifferent_access
  end

  def store(download, message_id, properties)
    extension = properties[:extension].present? ? ".#{properties[:extension]}" : File.extname(download.path.to_s)

    Media::Storage.store_file(
      download.path,
      filename: properties[:fileName].presence || "#{message_id || SecureRandom.hex(8)}#{extension}",
      content_type: download.content_type.presence || real_mime_type(properties)
    )
  end

  # Só o que é mime de verdade: `image` e `video` puros deixam o Active Storage identificar.
  def real_mime_type(properties)
    mime_type = mime_type_of(properties)
    mime_type if mime_type.to_s.include?("/")
  end

  def mime_type_of(properties)
    properties[:mimetype] || properties[:mime_type]
  end

  def build_message(chat, blob, message_id, from_me, properties, download)
    attributes = {
      role: from_me ? "assistant" : "user",
      chat: chat,
      message_id: message_id,
      message_origin: from_me ? "user" : "platform",
      content: properties[:caption].to_s,
      caption: properties[:caption],
      media_blob_id: blob.id.to_s
    }

    if image?(properties)
      ChatMessage::Image.new(image_url: Media::Storage.path_for(blob), **attributes)
    else
      ChatMessage::Media.new(
        media_url: Media::Storage.path_for(blob),
        media_type: mime_type_of(properties),
        media_properties: media_properties(properties, download),
        **attributes
      )
    end
  end

  def image?(properties)
    [ "image", "image/jpeg" ].include?(mime_type_of(properties))
  end

  def media_properties(properties, download)
    {
      "fileLength" => download.file_size,
      "mimeType" => download.content_type
    }.compact.merge(properties.select { |key, _value| VALID_MEDIA_PROPERTIES.include?(key.to_s) }.to_h)
  end
end
