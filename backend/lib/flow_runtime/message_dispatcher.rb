module FlowRuntime
  # O que sai do fluxo para o contato. No teste do editor nada vai para o canal: vira evento em tempo real.
  class MessageDispatcher
    def self.playground_stream(execution)
      ApplicationCable::Channel.organization_stream(execution.organization_id, "flow-playground:#{execution.id}")
    end

    def initialize(execution)
      @execution = execution
    end

    # @param generated [Boolean] o texto veio do modelo. Só ele passa pela limpeza: o que alguém escreveu no editor chega como
    #   foi escrito (ver Flows::TextDelivery).
    # @return [Flows::TextDelivery::Result] levanta quando o canal levanta, como `Chat#send_text_message`
    def send_text(text, sender_name: nil, generated: false)
      delivery = playground? ? preview_text(text, sender_name, generated) : deliver_text(text, sender_name, generated)
      report_missing_attachments(delivery.missing_attachments)
      delivery
    end

    # @param media [MediaMessageDto]
    # @return [ChatMessage::Media, nil]
    def send_media(media, sender_name: nil)
      return broadcast_media(media) if playground?
      raise I18n.t("automation.flows.errors.no_connector") unless chat&.connector

      Chats::SendMedia.call(chat: chat, media: media, sender_name: sender_name)
    end

    def ask_question(text, sender_name: nil)
      send_text(text, sender_name: sender_name)
    end

    def emit_event(name, payload = {})
      return broadcast(:event, name: name, payload: payload) if playground?

      Rails.logger.info("[FlowRuntime] evento #{name}: #{payload.inspect}")
    end

    # A decisão do juiz de saída do `ai_assistant`: só aparece no teste.
    def report_decision(payload)
      broadcast(:ai_decision, **payload) if playground?
    end

    def playground?
      @execution.playground?
    end

    private

    def chat
      @execution.chat
    end

    def deliver_text(text, sender_name, generated)
      raise I18n.t("automation.flows.errors.no_connector") unless chat&.connector

      Flows::TextDelivery.call(chat: chat, text: text, sender_name: sender_name, generated: generated)
    end

    # O teste do editor mostra as partes como iriam, sem enviar nem baixar nada.
    def preview_text(text, sender_name, generated)
      parts, missing = Flows::TextDelivery.preview(@execution.organization, text, generated: generated)
      parts.each { |part| part.is_a?(MediaMessageDto) ? broadcast_media(part) : broadcast(:text, body: part.to_s, sender: sender_name) }

      Flows::TextDelivery::Result.new(messages: [], missing_attachments: missing)
    end

    # O contato recebeu o texto sem o anexo, e nada na conversa diz isso: quem escreveu o fluxo fica sabendo por aqui.
    def report_missing_attachments(reasons)
      return if reasons.blank?
      return broadcast(:event, name: "attachment_missing", payload: { reasons: reasons }) if playground?

      OrganizationAlertService.flow_error(
        @execution.organization,
        @execution.flow,
        code: "flow_attachment_missing",
        message: I18n.t("automation.flows.errors.attachment_missing_alert", name: @execution.flow.name, reason: reasons.first),
        metadata: { execution_id: @execution.id, node_id: @execution.current_node_id, chat_id: @execution.chat_id }
      )
    rescue StandardError => e
      Rails.logger.error("[FlowRuntime] alerta não gravou: #{e.class}: #{e.message}")
    end

    def broadcast_media(media)
      broadcast(:media, attachmentId: media.attachment_id&.to_s, url: media.media_url, caption: media.caption)
    end

    def broadcast(kind, payload = {})
      ActionCable.server.broadcast(self.class.playground_stream(@execution), { kind: kind.to_s, **payload, at: Time.current.iso8601 })
    end
  end
end
