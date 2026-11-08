module FlowRuntime
  # O que sai do fluxo para o contato. No teste do editor nada vai para o canal: vira evento em tempo real.
  class MessageDispatcher
    # O fluxo chamado por "Ir para outro fluxo", no teste, fala no canal de quem chamou (`playground_stream_id`).
    def self.playground_stream(execution)
      id = execution.context.to_h["playground_stream_id"].presence || execution.id
      ApplicationCable::Channel.organization_stream(execution.organization_id, "flow-playground:#{id}")
    end

    def initialize(execution)
      @execution = execution
    end

    # @param generated [Boolean] o texto veio do modelo. Só ele passa pela limpeza: o que alguém escreveu no editor chega como
    #   foi escrito (ver Flows::TextDelivery).
    # @param usage [Hash] os tokens da resposta do modelo (`Llm#conversation_usage`)
    # @return [Flows::TextDelivery::Result] levanta quando o canal levanta, como `Chat#send_text_message`
    def send_text(text, sender_name: nil, generated: false, usage: {})
      delivery = playground? ? preview_text(text, sender_name, generated) : deliver_text(text, sender_name, generated, usage)
      report_missing_attachments(delivery.missing_attachments)
      delivery
    end

    # @param media [MediaMessageDto]
    # @return [ChatMessage::Media, nil]
    def send_media(media, sender_name: nil)
      return broadcast_media(media) if playground?
      raise I18n.t("automation.flows.errors.no_connector") unless chat&.connector

      Chats::SendMedia.call(chat: chat, media: media, sender_name: sender_name, attributes: message_attributes)
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

    # Uma ferramenta que a IA chamou, com o que mandou e o que voltou: só aparece no teste. Na execução de verdade, o
    # log do bloco guarda o nome, se deu certo e quanto levou.
    def report_tool_call(payload)
      broadcast(:tool_call, **payload) if playground?
    end

    def playground?
      @execution.playground?
    end

    # O que toda mensagem de fluxo leva. Quem separa automação de pessoa nas métricas é o resto: `role: "assistant"`, origem
    # `platform` e nenhuma conta, que é como sai tudo o que vem daqui (ver Insights::MessageAuthorship).
    def message_attributes
      { flow_id: @execution.flow_id.to_s }
    end

    private

    def chat
      @execution.chat
    end

    def deliver_text(text, sender_name, generated, usage)
      raise I18n.t("automation.flows.errors.no_connector") unless chat&.connector

      Flows::TextDelivery.call(chat: chat, text: text, sender_name: sender_name, generated: generated, attributes: message_attributes, usage: usage)
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

      @execution.alert!("flow_attachment_missing", I18n.t("automation.flows.errors.attachment_missing_alert", name: @execution.flow.name, reason: reasons.first))
    end

    def broadcast_media(media)
      broadcast(:media, attachmentId: media.attachment_id&.to_s, url: media.media_url, caption: media.caption)
    end

    def broadcast(kind, payload = {})
      ActionCable.server.broadcast(self.class.playground_stream(@execution), { kind: kind.to_s, **payload, at: Time.current.iso8601 })
    end
  end
end
