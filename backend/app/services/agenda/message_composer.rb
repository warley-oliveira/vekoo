module Agenda
  # O texto de um lembrete ou de um passo de sequência.
  #
  # Sem `ai_prompt`, é o texto configurado com as variáveis preenchidas: sai na hora e não custa
  # nada. Com `ai_prompt`, o texto é gerado pela camada `Ai::` e cobrado em créditos: reserva antes,
  # e devolve se nada útil sair.
  #
  # Se a geração não for possível (sem créditos, sem chave, modelo fora do ar), sai o texto
  # configurado. Lembrete que não sai é horário perdido, então a falha da geração não pode virar
  # silêncio. O motivo volta em `fallback_reason`.
  class MessageComposer
    CREDIT_COST = 1
    MAX_TOKENS = 2_000

    Composition = Struct.new(:text, :generated, :fallback_reason, keyword_init: true)

    # @param tools [Boolean] o modelo pode usar `SequenceToolExecutor`
    # @param preview [Boolean] as ferramentas não gravam nada
    def initialize(booking:, message:, ai_prompt:, chat: nil, history: nil, tools: false, preview: false, fallback_key: nil, ai: nil)
      @booking = booking
      @chat = chat || booking.chat
      @message = message
      @ai_prompt = ai_prompt
      @history = history
      @tools = tools
      @preview = preview
      @fallback_key = fallback_key
      @ai = ai
    end

    def ai?
      ai_prompt.present?
    end

    def template_text
      BookingPlaceholders.render(message.presence || default_message, booking).presence
    end

    # O caminho dos jobs: cobra e, se não der, cai no texto configurado.
    #
    # @return [Composition]
    def call
      return Composition.new(text: template_text, generated: false) unless ai?
      return fallback(:no_credits) unless organization.consume_credits(CREDIT_COST)

      begin
        text = generate.presence
        return Composition.new(text: text, generated: true) if text

        refund
        fallback(:empty)
      rescue Ai::Chat::MissingKey
        refund
        fallback(:unavailable)
      rescue Ai::Chat::Failed => e
        Rails.logger.error("[Agenda::MessageComposer] #{e.message}")
        refund
        fallback(:failed)
      end
    end

    # Só a geração, sem cobrar e sem cair no texto. Quem chama é a simulação da tela, que usa
    # `Ai::Run` e precisa do erro de verdade.
    def generate(ai = @ai || Ai::Chat.new)
      prompt = MessagePrompts.prompt(booking: booking, instructions: ai_prompt, history: history)

      if tools
        executor = SequenceToolExecutor.new(chat, booking, preview: preview)
        ai.complete_with_tools(
          system: MessagePrompts.system(tools: true), prompt: prompt, tools: executor.definitions, max_tokens: MAX_TOKENS
        ) { |name, input| executor.execute(name, input) }
      else
        ai.complete(system: MessagePrompts.system, prompt: prompt, max_tokens: MAX_TOKENS)
      end.to_s.strip
    end

    private

    attr_reader :booking, :chat, :message, :ai_prompt, :tools, :preview, :fallback_key

    def organization
      booking.calendar.organization
    end

    def history
      @history ||= ChatHistory.for(chat)
    end

    def refund
      organization.refund_credits!(CREDIT_COST)
    end

    def fallback(reason)
      Composition.new(text: template_text, generated: false, fallback_reason: reason)
    end

    # Passo só com instrução, sem texto: sem geração, não há o que enviar.
    def default_message
      fallback_key && I18n.t(fallback_key, locale: :"pt-BR")
    end
  end
end
