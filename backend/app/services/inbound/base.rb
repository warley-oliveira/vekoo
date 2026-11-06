module Inbound
  # O que os webhooks de provedor têm em comum. Cada subclasse traduz o payload do seu
  # canal; todas terminam em `Chats::InboundFlow`.
  #
  # Roda dentro de `Inbound::ProcessWebhookJob`: o controlador só valida e enfileira, para
  # nenhuma consulta pesada ocupar a thread do Puma enquanto o provedor reentrega.
  class Base
    def initialize(payload, connector: nil)
      @payload = payload
      @connector = connector
    end

    private

    attr_reader :payload, :connector

    def organization
      connector.organization
    end

    # Conversa nova entra com a automação padrão da organização (ver Chats::Locator).
    # Consulta o banco de propósito: o default_scope já deixa as notas de fora, e o cartão
    # de anúncio (nota criada antes deste ponto) não pode contar como primeira mensagem.
    def first_message?(chat)
      !ChatMessage::Base.where(chat_id: chat.id).exists?
    end

    # Webhook é reentregue. O id externo dentro da conversa é o que torna isto idempotente.
    def already_persisted?(chat, message_id)
      return false if message_id.blank?

      ChatMessage::Base.unscoped.where(chat_id: chat.id, message_id: message_id).exists?
    end

    def resolve_reply_to(chat, external_id)
      return nil if external_id.blank?

      ChatMessage::Base.unscoped.where(chat_id: chat.id, message_id: external_id).take&.id&.to_s
    end

    def create_text_message(chat, content, message_id:, from_me: false, **attributes)
      ChatMessage::Text.create!(
        role: from_me ? "assistant" : "user",
        content: content,
        chat: chat,
        message_id: message_id,
        message_origin: from_me ? "user" : "platform",
        **attributes
      )
    end

    # "Limpeza de contexto por inatividade": configuração da organização, desligada por padrão.
    def clear_context_if_inactive(chat)
      return unless organization.auto_clear_context_enabled
      return if chat.last_message_at.blank?
      return if (chat.last_message_at + organization.auto_clear_context_interval.hours) > Time.current

      chat.clear_context!(I18n.t("connectors.notes.context_cleared_inactivity"))
    end

    def normalize_name(input)
      return nil if input.blank?

      input.to_s.unicode_normalize(:nfkd).gsub(/[^[:print:]]+/, "")
    end
  end
end
