module Chats
  # Freio para contato que manda mensagem demais (outro robô, por exemplo). Na origem
  # protegia o custo do LLM; aqui protege os fluxos de entrarem em laço com ele.
  #
  # Só vale em produção, como na origem: em desenvolvimento e nos testes as rajadas são a
  # regra. Só o canal Z-API conta mensagens por período, também como na origem; as
  # advertências valem para o WhatsApp Web em qualquer provedor (ver `Chats::InboundFlow`).
  class InboundThrottle
    RATE_LIMIT = 25
    PERIOD = 4.minutes
    DELAY = 10.minutes
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

    # Quanto a automação deve esperar por este contato; nil quando não há o que esperar.
    def delay
      return nil unless exceeded?

      ChatMessage::Text.create(
        role: "base",
        content: I18n.t("connectors.notes.rate_limited"),
        role_base_type: "automation-stopped",
        chat: chat
      )
      chat.inc(red_flag_count: 1)
      DELAY
    end

    def self.reset(chat)
      Rails.cache.delete(counter_key(chat))
      Rails.cache.delete(window_key(chat))
    end

    def self.counter_key(chat)
      "chats.inbound_rate.#{chat.id}"
    end

    def self.window_key(chat)
      "#{counter_key(chat)}.window_ends_at"
    end

    private

    attr_reader :chat

    def exceeded?
      key = self.class.counter_key(chat)
      count = Rails.cache.read(key).to_i
      return true if count >= RATE_LIMIT && Rails.env.production?

      # O prazo é o da primeira mensagem: renovar a cada uma faria quem escreve devagar, mas
      # sem parar, acumular até ser freado.
      window_ends_at = Rails.cache.fetch(self.class.window_key(chat), expires_in: PERIOD) { PERIOD.from_now.to_f }
      Rails.cache.write(key, count + 1, expires_in: [ window_ends_at - Time.current.to_f, 1 ].max)
      false
    end
  end
end
