module Chats
  # A mensagem que uma pessoa escreve na tela: pausa a automação (é intervenção humana),
  # quebra o texto nas partes que vão para o canal e envia cada uma. Só a primeira parte de
  # texto leva a citação ao provedor: citar em toda parte fica estranho no WhatsApp de quem
  # recebe. O `reply_to_message_id` local fica em todas, para a tela mostrar o bloco.
  class SendOperatorMessage
    # @param chat [Chat]
    # @param account [Account] quem escreveu
    # @param text [String]
    # @param reply_to_message_id [String, nil] id Mongo da mensagem citada
    # @return [ChatMessage::Text] a mensagem criada
    def self.call(chat:, account:, text:, reply_to_message_id: nil)
      new(chat, account, text, reply_to_message_id).call
    end

    def initialize(chat, account, text, reply_to_message_id)
      @chat = chat
      @account = account
      @text = text.to_s
      @reply_to_message_id = reply_to_message_id.to_s.presence
      @collaborator_prefix_applied = false
      @reply_to_consumed = false
    end

    def call
      chat.pause_automation_for_human!

      parts = handled_parts
      @has_span = parts.size > 1

      @message = ChatMessage::Text.create(
        role: "assistant",
        content: text,
        has_span: @has_span,
        reply_to_message_id: reply_to_message_id,
        **author_attributes
      )

      parts.each { |part| part.is_a?(MediaMessageDto) ? send_media(part) : send_text(part.to_s) }

      chat.last_message_at = Time.now
      chat.update_last_message
      chat.save
      @message
    end

    private

    attr_reader :chat, :account, :text, :reply_to_message_id

    def connector
      chat.connector
    end

    def author_attributes
      { chat: chat, sender_name: account.name, account_id: account.id, message_origin: "frontend" }
    end

    def handled_parts
      MessageHandling.new(chat.organization, min_line_breaks: 10, split_links: false).perform(text)
    rescue AttachmentNotFoundException => e
      Rails.logger.error("[Chats::SendOperatorMessage] #{e.message}")
      [ text ]
    end

    def send_media(dto)
      ChatMessage::Media.create(
        role: "assistant",
        media_type: dto.media_type,
        attachment_id: dto.attachment_id&.to_s,
        content: dto.caption,
        has_span: false,
        is_span: true,
        media_url: dto.media_url,
        **author_attributes
      )

      begin
        if dto.media_type == "audio"
          connector.send_audio_message_by_url(chat.phone_number, dto.media_url, chat)
        else
          connector.send_media_message(chat.phone_number, dto, chat)
        end
      rescue StandardError => e
        Rails.logger.error("[Chats::SendOperatorMessage] media dispatch failed: #{e.message}")
      end

      sleep(1) if @has_span
    end

    def send_text(piece)
      return if piece.strip.empty?

      send_error = nil
      external_id = begin
        connector.send_text_message(chat.phone_number, with_collaborator_prefix(piece), chat, reply_to_external_id: next_reply_external_id)
      rescue StandardError => e
        Rails.logger.error("[Chats::SendOperatorMessage] text dispatch failed: #{e.message}")
        send_error = e.message
        nil
      end

      status = external_id ? "delivery_ack" : "failed"

      if @has_span
        ChatMessage::Text.create(
          role: "assistant",
          content: piece,
          has_span: false,
          is_span: true,
          reply_to_message_id: reply_to_message_id,
          message_id: external_id,
          status: status,
          status_message: send_error,
          **author_attributes
        )
      else
        @message.update(message_id: external_id, status: status, status_message: send_error)
      end
    end

    def with_collaborator_prefix(piece)
      return piece if !connector.send_collaborator_name || @collaborator_prefix_applied

      @collaborator_prefix_applied = true
      "*#{account.name}*\n#{piece}"
    end

    def next_reply_external_id
      return nil if @reply_to_consumed

      @reply_to_consumed = true
      replied_external_id
    end

    def replied_external_id
      return nil unless reply_to_message_id

      ChatMessage::Base.unscoped.where(chat_id: chat.id, id: reply_to_message_id).take&.message_id
    end
  end
end
