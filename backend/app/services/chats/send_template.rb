module Chats
  # Envia um modelo de mensagem da WABA. O histórico é criado antes do envio, para a
  # tentativa ficar visível mesmo quando a Meta recusa: nesse caso a mensagem vira `failed`
  # com a causa em `status_message`.
  class SendTemplate
    # @param chat [Chat]
    # @param template [WhatsappTemplate]
    # @param components [Array<Hash>] os parâmetros, no formato da Meta
    # @param account [Account, nil] quem enviou, quando foi uma pessoa
    # @param sender_name [String, nil] nome exibido quando não foi uma pessoa
    # @param attributes [Hash] campos extras da mensagem (ex.: `campaign_id:`)
    # @return [ChatMessage::Base] a mensagem criada
    def self.call(chat:, template:, components: [], account: nil, sender_name: nil, attributes: {})
      new(chat, template, components, account, sender_name, attributes).call
    end

    def initialize(chat, template, components, account, sender_name, attributes)
      @chat = chat
      @template = template
      # Quem chama de Ruby manda símbolo; o que vem do canal já é string. Com símbolo, o texto
      # guardado no histórico ficaria com `{{1}}` no lugar dos parâmetros.
      @components = Array(components).map do |component|
        component = component.to_unsafe_h if component.respond_to?(:to_unsafe_h)
        component.respond_to?(:deep_stringify_keys) ? component.deep_stringify_keys : component
      end
      @account = account
      @sender_name = sender_name
      @attributes = attributes
    end

    def call
      message = create_message
      deliver(message)

      chat.last_message_at = Time.now
      chat.update_last_message
      chat.save
      message
    end

    private

    attr_reader :chat, :template, :components, :account, :sender_name, :attributes

    def deliver(message)
      response = chat.connector.send_template_message(template, components, chat)
      external_id = response&.data&.messages&.first&.id

      if external_id
        message.update(message_id: external_id, status: "delivery_ack")
      else
        error = response.respond_to?(:error) ? response.error : nil
        Rails.logger.error("[Chats::SendTemplate] #{template.name} (#{template.language}): [#{error&.code}] #{error&.message}")
        message.update(status: "failed", status_message: error&.message || I18n.t("connectors.messages.template_failed"))
      end
    rescue StandardError => e
      Rails.logger.error("[Chats::SendTemplate] #{e.class}: #{e.message}")
      message.update(status: "failed", status_message: e.message)
    end

    def base_attributes
      {
        role: "assistant",
        sender_name: account&.name || sender_name,
        account_id: account&.id,
        message_origin: account ? "frontend" : "platform",
        chat: chat,
        **attributes
      }
    end

    def rendered_text
      template.render_message_text(components).presence || I18n.t("connectors.messages.template_fallback", name: template.name)
    end

    # Conforme o cabeçalho do modelo. A URL vem do anexo ligado ao modelo: o
    # `example.header_handle` da Meta aponta para o CDN interno dela e responde 403 fora da
    # sessão autenticada, e guardado no histórico viraria mídia quebrada.
    def create_message
      return ChatMessage::Text.create(**base_attributes, content: rendered_text) unless template.has_media_header?

      media_url = template.resolved_header_media_url
      format = template.header_format.downcase

      case format
      when "image"
        ChatMessage::Image.create(**base_attributes, image_url: media_url, content: rendered_text, caption: rendered_text, media_type: "image")
      when "video", "document"
        ChatMessage::Media.create(**base_attributes, media_url: media_url, content: rendered_text, caption: rendered_text, media_type: format)
      else
        ChatMessage::Text.create(**base_attributes, content: rendered_text)
      end
    end
  end
end
