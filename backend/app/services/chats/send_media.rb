module Chats
  # Envia uma mídia já guardada, por qualquer conector, e registra no histórico: o caminho
  # que os outros domínios usam para mandar imagem, vídeo, documento ou áudio.
  class SendMedia
    # @param chat [Chat]
    # @param media [MediaMessageDto] tipo, nome, legenda e URL
    # @param account [Account, nil] quem enviou, quando foi uma pessoa
    # @param sender_name [String, nil] nome exibido quando não foi uma pessoa
    # @param attributes [Hash] campos extras da mensagem (ex.: `campaign_id:`)
    # @return [ChatMessage::Media] a mensagem criada, `failed` se o canal recusou
    def self.call(chat:, media:, account: nil, sender_name: nil, attributes: {})
      new(chat, media, account, sender_name, attributes).call
    end

    def initialize(chat, media, account, sender_name, attributes)
      @chat = chat
      @media = media
      @account = account
      @sender_name = sender_name
      @attributes = attributes
    end

    def call
      message = ChatMessage::Media.create(
        role: "assistant",
        chat: chat,
        media_type: media.media_type,
        media_url: media.media_url,
        attachment_id: media.attachment_id&.to_s,
        content: media.caption.to_s,
        caption: media.caption,
        sender_name: account&.name || sender_name || chat.organization&.name,
        account_id: account&.id,
        message_origin: account ? "frontend" : "platform",
        status: "pending",
        media_properties: { "fileName" => media.file_name }.compact,
        **attributes
      )

      deliver(message)
      message
    end

    private

    attr_reader :chat, :media, :account, :sender_name, :attributes

    def deliver(message)
      response =
        if media.media_type.to_s == "audio"
          chat.connector.send_audio_message_by_url(chat.phone_number, media.media_url, chat)
        else
          chat.connector.send_media_message(chat.phone_number, media, chat)
        end

      # O SDK da Meta não levanta: a recusa vem dentro da resposta.
      error = response.try(:error)
      return message.update(status: "failed", status_message: error.message) if error

      external_id = Connectors::ExternalId.from(response)
      message.update(message_id: external_id, status: "delivery_ack")
    rescue StandardError => e
      Rails.logger.error("[Chats::SendMedia] #{e.class}: #{e.message}")
      message.update(status: "failed", status_message: e.message)
    end
  end
end
