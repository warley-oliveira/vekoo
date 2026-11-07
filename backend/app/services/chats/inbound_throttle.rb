module Chats
  # Freio para contato que acumulou advertências (outro robô, por exemplo). Na origem
  # protegia o custo do LLM; aqui protege os fluxos de entrarem em laço com ele. Vale para o
  # WhatsApp Web em qualquer provedor (ver `Chats::InboundFlow`), como na origem.
  class InboundThrottle
    RED_FLAG_LIMIT = 5

    def initialize(chat)
      @chat = chat
    end

    # Avisos demais: a automação é desligada para esse contato e só uma pessoa religa.
    def red_flagged?
      return false unless chat.red_flag_count >= RED_FLAG_LIMIT

      if chat.automation_enabled
        ChatMessage::Text.create(
          role: "base",
          content: I18n.t("connectors.notes.red_flag_quota"),
          role_base_type: "automation-stopped",
          chat: chat
        )
        chat.update(automation_enabled: false, automation_toggle_noted: true)
      end
      true
    end

    private

    attr_reader :chat
  end
end
