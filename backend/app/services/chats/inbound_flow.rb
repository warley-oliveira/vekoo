module Chats
  # O que acontece depois que uma mensagem do canal já está persistida (e transmitida, pelos
  # callbacks de `ChatMessage::Base`). Único caminho até a automação, para todos os canais:
  #
  #   * mensagem nossa, feita fora da plataforma (`from_me`): é intervenção humana, a
  #     automação pausa pelo período da organização;
  #   * mensagem do contato: conta como não lida e, se a automação pode rodar, chama
  #     `Flows::InboundDispatcher` agora ou na próxima janela de atendimento.
  #
  # Na origem este era o trecho que agendava a geração de resposta por LLM.
  class InboundFlow
    # @param chat [Chat]
    # @param message [ChatMessage::Base]
    # @param text [String] o que os fluxos recebem (legenda ou transcrição, nas mídias)
    # @param first_message [Boolean] é a primeira mensagem real da conversa
    # @param from_me [Boolean] enviada pelo nosso lado, fora da plataforma
    # @param dispatch [Boolean] false quando o conteúdo ainda não chegou
    # @param count_unread [Boolean] false quando é o conteúdo de uma mensagem já contada
    def self.call(chat:, message:, text:, first_message: false, from_me: false, dispatch: true, count_unread: true)
      new(chat, message, text, first_message, from_me, dispatch, count_unread).call
    end

    def initialize(chat, message, text, first_message, from_me, dispatch, count_unread)
      @chat = chat
      @message = message
      @text = text.to_s
      @first_message = first_message
      @from_me = from_me
      @dispatch = dispatch
      @count_unread = count_unread
    end

    def call
      return register_from_me if from_me

      sync_preview(unread_messages: chat.unread_messages.to_i + (count_unread ? 1 : 0))
      return unless dispatch && automation_can_run?

      deliver_to_flows
    end

    private

    attr_reader :chat, :message, :text, :first_message, :from_me, :dispatch, :count_unread

    def organization
      chat.organization
    end

    def register_from_me
      sync_preview(unread_messages: 0)
      chat.pause_automation_for_human!
    end

    # A mensagem pode trazer a data do provedor, segundos antes do `last_message_at` da
    # conversa, e aí o sync do callback (que só avança) não atualiza a prévia. Mensagem que
    # é recebida agora é a última da lista.
    def sync_preview(attributes)
      chat.set(
        last_message_at: [ chat.last_message_at, message.created_at ].compact.max,
        last_message_type: message.type_element,
        last_message_content: message.content,
        last_message_by: message.role,
        **attributes
      )
      chat.dispatch_event! unless chat.ignore_events
    end

    def automation_can_run?
      return false unless chat.automation_enabled
      return false unless organization&.automation_enabled?

      connector = chat.connector
      connector.nil? || connector.active?
    end

    def deliver_to_flows
      connector = chat.connector
      limiter = InboundThrottle.new(chat)
      # Advertências valem para o WhatsApp Web em qualquer provedor; a contagem por período,
      # que é o que gera advertência, só na Z-API. Os dois como na origem.
      return if connector.respond_to?(:zapi_provider?) && limiter.red_flagged?

      delay = limiter.delay if connector.try(:zapi_provider?)

      return defer_outside_window if outside_window?
      return schedule(wait: delay) if delay

      InboundDelivery.call(chat: chat, text: text, event: event, message_id: message.message_id)
    end

    def event
      first_message ? "first_message" : "message_received"
    end

    def outside_window?
      organization.business_work_enabled && !organization.inside_business_window?
    end

    # Fora da janela a automação fica para a próxima abertura, uma vez só por conversa. A
    # primeira mensagem é a que conta: é o que a origem fazia com a resposta do assistente.
    def defer_outside_window
      return if chat.scheduled_outside_business_work.present?

      next_window = organization.next_business_window
      return unless next_window

      chat.set(scheduled_outside_business_work: next_window)
      schedule(wait_until: next_window)
    end

    def schedule(**timing)
      DispatchInboundJob.set(**timing).perform_later(
        chat.id.to_s, chat.organization_id, text, event, message.message_id
      )
    end
  end
end
