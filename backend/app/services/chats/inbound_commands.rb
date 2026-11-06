module Chats
  # Comandos digitados no canal, pelo contato ou no nosso próprio aparelho, para quem está
  # testando um número: limpar o contexto (`CCTX`) e religar a automação. Não viram mensagem
  # no histórico.
  #
  # O `PFUP` da origem (depuração de follow-up do assistente) saiu com os follow-ups.
  module InboundCommands
    CLEAR_CONTEXT = [ "--CLEAR-CONTEXT--", "CCTX" ].freeze
    REACTIVATE = "--RE-ACTIVE-ME--".freeze

    module_function

    # @param to [String] para quem o conector responde
    # @param clear_commands [Array<String>] LeadChat usa um comando próprio, para não colidir
    # @return [Boolean] true quando era um comando, e aí a mensagem não segue adiante
    def handle(chat:, connector:, text:, to:, clear_commands: CLEAR_CONTEXT, reactivate: true)
      stripped = text.to_s.strip

      if clear_commands.include?(stripped.upcase)
        clear_context(chat, connector, to)
        true
      elsif reactivate && stripped.upcase == REACTIVATE
        chat.update(automation_enabled: true)
        connector.send_text_message(to, I18n.t("connectors.notes.reactivated"), chat)
        true
      else
        false
      end
    end

    def clear_context(chat, connector, to)
      chat.clear_context!
      InboundThrottle.reset(chat)
      connector.send_text_message(to, I18n.t("connectors.notes.context_cleared"), chat)
    end
    private_class_method :clear_context
  end
end
