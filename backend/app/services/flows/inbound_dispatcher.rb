module Flows
  # O único ponto de automação no caminho da mensagem recebida: quem chama é `Chats::InboundDelivery`, depois de a
  # mensagem estar persistida e transmitida, e só quando a automação pode rodar.
  #
  # Aqui só se decide o caminho, sem rodar nada. A decisão de verdade (retomar quem espera, começar novos) é de
  # `Flows::Dispatch`, em job: quem está chamando é o processamento de webhook, que não pode travar.
  #
  # **Debounce.** Quem escreve em três mensagens seguidas recebe uma resposta só. As mensagens entram numa caixa dentro do
  # próprio documento da conversa, com `$push` atômico: dois webhooks simultâneos não perdem nada. Só a primeira agenda um
  # job, e as seguintes só empurram o prazo. É o `perform_in` da regra 7 da origem: uma fila de agendados que cresce a cada
  # mensagem encarece toda mensagem da plataforma, então aqui há no máximo um job agendado por conversa.
  #
  #   chat:       [Chat] a conversa
  #   text:       [String] o texto recebido (legenda ou transcrição, nas mídias)
  #   event:      [String] first_message, message_received, human_handoff ou contact_created
  #   message_id: [String, nil] id da mensagem no provedor
  class InboundDispatcher
    MESSAGE_EVENTS = %w[first_message message_received].freeze
    # O `delay_response` padrão que os assistentes tinham. Por organização em `settings["flow_debounce_seconds"]`.
    DEFAULT_DEBOUNCE_SECONDS = 3
    MAX_DEBOUNCE_SECONDS = 60
    # Quem escreve dezenas de mensagens num piscar de olhos não incha o documento.
    MAX_INBOX = 20
    # O job agendado sumiu (o Redis caiu): a próxima mensagem agenda outro.
    STALE_DEADLINE = 5.minutes

    def self.call(chat:, text:, event: "message_received", message_id: nil)
      new(chat, text, event, message_id).call
    end

    # Contato criado e transferência humana nascem na conversa, não no caminho da mensagem: quem entrega mensagem chama `call`.
    def self.fire_event(chat:, event:)
      new(chat, "", event, nil).call
    end

    # Fim de uma rodada: o que chegou enquanto a execução rodava esperou na caixa, e sai agora.
    def self.flush(execution)
      return if execution.chat_id.blank?

      pending = Chat.where(organization_id: execution.organization_id.to_s, id: execution.chat_id, :flow_inbox_deadline.ne => nil).exists?
      DebouncedDispatchJob.perform_later(execution.chat_id, execution.organization_id.to_s) if pending
    end

    # A mensagem chegou tarde para a execução que ia retomar (ver ResumeExecutionJob). Volta para a caixa, sem prazo a esperar.
    def self.requeue(execution, message)
      Chat.collection.update_one(
        { _id: BSON::ObjectId.from_string(execution.chat_id), organization_id: execution.organization_id.to_s },
        {
          "$push" => { flow_inbox: { "$each" => [ { "text" => message.content, "event" => "message_received", "message_id" => message.message_id, "at" => Time.now.to_f } ], "$slice" => -MAX_INBOX } },
          "$set" => { flow_inbox_deadline: Time.now.utc }
        }
      )
      DebouncedDispatchJob.perform_later(execution.chat_id, execution.organization_id.to_s)
    end

    def self.debounce_seconds(organization)
      configured = organization&.settings.to_h["flow_debounce_seconds"]
      return DEFAULT_DEBOUNCE_SECONDS if configured.nil?

      clamp_debounce(configured)
    end

    def self.clamp_debounce(seconds)
      seconds.to_i.clamp(0, MAX_DEBOUNCE_SECONDS)
    end

    def initialize(chat, text, event, message_id)
      @chat = chat
      @text = text.to_s
      @event = event.to_s
      @message_id = message_id
    end

    def call
      return false unless chat&.organization_id

      return enqueue_event unless MESSAGE_EVENTS.include?(event)
      return false unless something_to_do?

      enqueue_message
      true
    end

    private

    attr_reader :chat, :text, :event, :message_id

    # Barato, porque roda a cada mensagem: a organização sem fluxo não paga caixa nem job.
    def something_to_do?
      chat.outreach_flow_id.present? ||
        TriggerIndex.message_flows?(chat.organization_id) ||
        FlowExecution.active.for_chat(chat.organization_id, chat.id).real_runs.exists?
    end

    # Contato criado e transferência humana não têm rajada para juntar.
    def enqueue_event
      return false unless TriggerIndex.active?(chat.organization_id, event)

      EventDispatchJob.perform_later(chat.id.to_s, chat.organization_id, event, text)
      true
    end

    def enqueue_message
      window = self.class.debounce_seconds(chat.organization)
      now = Time.current

      before = Chat.collection.find_one_and_update(
        { _id: chat.id, organization_id: chat.organization_id },
        {
          "$push" => { flow_inbox: { "$each" => [ item(now) ], "$slice" => -MAX_INBOX } },
          "$set" => { flow_inbox_deadline: now + window }
        },
        return_document: :before,
        projection: { flow_inbox_deadline: 1 }
      )

      schedule(window) unless job_pending?(before)
    end

    def item(now)
      { "text" => text, "event" => event, "message_id" => message_id, "at" => now.to_f }
    end

    def job_pending?(before)
      deadline = before && before["flow_inbox_deadline"]
      deadline.present? && deadline > STALE_DEADLINE.ago
    end

    def schedule(window)
      job = window.positive? ? DebouncedDispatchJob.set(wait: window.seconds) : DebouncedDispatchJob
      job.perform_later(chat.id.to_s, chat.organization_id)
    end
  end
end
