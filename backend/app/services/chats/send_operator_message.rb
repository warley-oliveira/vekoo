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
      # A nota da pausa diz quem foi: é uma pessoa intervindo, e não uma mudança do backend.
      chat.updated_by_account = account
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
      flag_missing_attachments(parts)

      chat.last_message_at = Time.now
      chat.update_last_message
      chat.save
      @message
    ensure
      Array(parts).grep(MediaMessageDto).each(&:discard_download)
    end

    private

    attr_reader :chat, :account, :text, :reply_to_message_id

    def connector
      chat.connector
    end

    def author_attributes
      { chat: chat, sender_name: account.name, account_id: account.id, message_origin: "frontend" }
    end

    # `verbatim`: o que a pessoa escreveu chega ao cliente como foi escrito.
    def handled_parts
      handling = MessageHandling.new(chat.organization, min_line_breaks: 10, split_links: false, verbatim: true)
      parts = handling.perform(text)
      @missing_attachments = handling.missing_attachments
      parts
    end

    # O anexo citado sumiu: o resto da mensagem segue, e a pessoa fica sabendo do que não foi.
    # Sem nada para enviar, a mensagem é uma falha. Dividida em partes, a original nunca aparece na
    # conversa: o aviso vai na última parte, sem apagar o motivo de ela mesma ter falhado.
    def flag_missing_attachments(parts)
      return if @missing_attachments.blank?

      return @message.update(status: "failed", status_message: @missing_attachments.first) if parts.empty?

      target = @last_part || @message
      target.update(status_message: [ target.status_message, @missing_attachments.first ].compact.join(" "))
    end

    def send_media(dto)
      part = ChatMessage::Media.create(
        role: "assistant",
        media_type: dto.media_type,
        attachment_id: dto.attachment_id&.to_s,
        content: dto.caption,
        has_span: false,
        is_span: true,
        media_url: dto.stored_url,
        **author_attributes
      )
      @last_part = part

      begin
        response =
          if dto.media_type == "audio"
            connector.send_audio_message_by_url(chat.phone_number, dto.media_url, chat)
          else
            connector.send_media_message(chat.phone_number, dto, chat)
          end

        # O SDK da Meta não levanta: a recusa vem dentro da resposta.
        error = response.try(:error)
        if error
          part.update(status: "failed", status_message: error.message)
        else
          part.update(message_id: Connectors::ExternalId.from(response), status: "delivery_ack")
        end
      rescue StandardError => e
        Rails.logger.error("[Chats::SendOperatorMessage] media dispatch failed: #{e.message}")
        part.update(status: "failed", status_message: Connectors::SendFailure.reason(e))
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
        send_error = Connectors::SendFailure.reason(e)
        nil
      end
      send_error ||= connector.try(:last_send_error) unless external_id

      status = external_id ? "delivery_ack" : "failed"

      if @has_span
        @last_part = ChatMessage::Text.create(
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
