module FlowRuntime
  # O que sai do fluxo para o contato. No teste do editor nada vai para o canal: vira evento em tempo real.
  class MessageDispatcher
    def self.playground_stream(execution)
      ApplicationCable::Channel.organization_stream(execution.organization_id, "flow-playground:#{execution.id}")
    end

    def initialize(execution)
      @execution = execution
    end

    # @return [ChatMessage::Text, nil] levanta quando o canal levanta, como `Chat#send_text_message`
    def send_text(text, sender_name: nil)
      return broadcast(:text, body: text, sender: sender_name) if playground?
      raise I18n.t("automation.flows.errors.no_connector") unless chat&.connector

      chat.send_text_message(text, sender_name, message_origin: "platform")
    end

    # @param media [MediaMessageDto]
    # @return [ChatMessage::Media, nil]
    def send_media(media, sender_name: nil)
      return broadcast(:media, attachmentId: media.attachment_id&.to_s, url: media.media_url, caption: media.caption) if playground?
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

    def broadcast(kind, payload = {})
      ActionCable.server.broadcast(self.class.playground_stream(@execution), { kind: kind.to_s, **payload, at: Time.current.iso8601 })
    end
  end
end
