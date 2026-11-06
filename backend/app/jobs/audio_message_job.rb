# Áudio recebido de um canal: baixa do provedor, guarda aqui, transcreve quando faz sentido,
# cria a mensagem e segue para `Chats::InboundFlow`.
class AudioMessageJob < ApplicationJob
  queue_as :critical

  retry_on StandardError, wait: :polynomially_longer, attempts: 3 do |job, error|
    job.register_failure(error)
  end

  # @param audio_reference [String] URL ou id de mídia do provedor
  # @param raw_json [String] o trecho do webhook, para quem baixa pelo payload (WhatsApp Web)
  def perform(chat_id, organization_id, audio_reference, message_id, from_me = false, _user_name = nil, raw_json = nil)
    return if audio_reference.blank?

    chat = Chat.scoped(organization_id, chat_id)
    return unless chat
    return if message_id.present? && ChatMessage::Base.unscoped.where(chat_id: chat.id, message_id: message_id).exists?

    download = fetch(chat, audio_reference, message_id, parse(raw_json), from_me)
    blob = download && store(chat, download, message_id)
    transcription = from_me || download.nil? ? nil : Chats::AudioTranscriber.call(download.path, chat)

    first_message = !ChatMessage::Base.where(chat_id: chat.id).exists?
    message = ChatMessage::Audio.create!(
      role: from_me ? "assistant" : "user",
      content: from_me ? "" : transcription || "-",
      chat: chat,
      message_id: message_id,
      message_origin: from_me ? "user" : "platform",
      audio_url: blob ? Media::Storage.path_for(blob) : audio_reference,
      media_blob_id: blob&.id&.to_s
    )

    Chats::InboundFlow.call(chat: chat, message: message, text: transcription.to_s, first_message: first_message, from_me: from_me)
  ensure
    Inbound::MediaDownload.cleanup(download&.path)
  end

  def register_failure(error)
    chat_id, organization_id = arguments
    Rails.logger.error("[AudioMessageJob] #{error.class}: #{error.message} chat=#{chat_id}")

    chat = Chat.scoped(organization_id, chat_id)
    return unless chat

    ChatMessage::Text.create(role: "base", role_base_type: "error", content: I18n.t("connectors.notes.media_failed"), chat: chat)
  end

  private

  def parse(json)
    return nil if json.blank?

    JSON.parse(json).with_indifferent_access
  rescue JSON::ParserError
    nil
  end

  # Áudio nosso, enviado de outro aparelho: se não der para baixar, fica o link do provedor.
  # Áudio do contato levanta, para a nova tentativa.
  def fetch(chat, audio_reference, message_id, raw, from_me)
    download = Inbound::MediaDownload.audio(chat.connector, audio_reference, message_id: message_id, raw: raw)
    raise "Audio not retrieved for message #{message_id}" if download.path.blank?

    download
  rescue StandardError => e
    raise unless from_me

    Rails.logger.error("[AudioMessageJob] Error saving audio from_me: #{e.message}")
    nil
  end

  def store(chat, download, message_id)
    extension = File.extname(download.path.to_s).presence || ".ogg"
    Media::Storage.store_file(download.path, filename: "#{chat.phone_number}-#{message_id}#{extension}")
  end
end
