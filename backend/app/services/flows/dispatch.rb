module Flows
  # O que uma mensagem (ou evento) faz acontecer: retoma quem espera por ela e, se ninguém esperava, começa os fluxos
  # publicados cujo gatilho casa. Roda em job.
  #
  # O fluxo de campanha tem prioridade: quem respondeu a uma campanha é atendido pelo fluxo que ela escolheu. Se ele não
  # existir mais, for de outra organização ou não estiver publicado, é como se a campanha não tivesse fluxo.
  class Dispatch
    EVENT_TO_TRIGGER_TYPES = {
      # A origem disparava `first_message` em toda mensagem, e `keyword` sem conferir a palavra.
      "first_message" => %w[first_message message_received keyword],
      "message_received" => %w[message_received keyword],
      "human_handoff" => %w[human_handoff],
      "contact_created" => %w[contact_created]
    }.freeze
    MESSAGE_EVENTS = InboundDispatcher::MESSAGE_EVENTS

    # @param message_id [String, nil] o id da última mensagem, no provedor
    def self.call(chat:, text:, event:, message_id: nil)
      new(chat, text, event, message_id).call
    end

    def initialize(chat, text, event, message_id)
      @chat = chat
      @text = text.to_s
      @event = event.to_s
      @message_id = message_id
    end

    def call
      resumed = message_event? && resume_waiting
      start_new unless resumed
      nil
    end

    private

    attr_reader :chat, :text, :event, :message_id

    def organization_id
      chat.organization_id
    end

    def message_event?
      MESSAGE_EVENTS.include?(event)
    end

    def message_payload
      FlowRuntime::InboundMessage.new(text, message_id: message_id).to_h
    end

    def resume_waiting
      executions = FlowExecution.waiting_for_message.for_chat(organization_id, chat.id).real_runs.pluck(:id)
      executions.each do |id|
        ResumeExecutionJob.perform_later(id, organization_id, { "message" => message_payload })
      end
      executions.any?
    end

    def start_new
      flows = message_event? ? (outreach_flow ? [ outreach_flow ] : triggered_flows) : triggered_flows

      flows.each do |flow|
        StartExecutionJob.perform_later(flow.id, organization_id, chat.id.to_s, start_options(flow))
      end
    end

    def start_options(flow)
      {
        "message" => (message_payload if message_event?),
        "event" => event,
        "idempotency_key" => idempotency_key(flow)
      }.compact
    end

    # A mesma mensagem nunca começa o mesmo fluxo duas vezes, mesmo se o job for entregue de novo. Contato criado só
    # acontece uma vez por conversa. Transferência acontece várias, e quem segura é o índice de uma execução viva.
    def idempotency_key(flow)
      return "#{flow.id}:#{chat.id}:contact_created" if event == "contact_created"
      return nil if message_id.blank?

      "#{flow.id}:#{chat.id}:#{message_id}"
    end

    def outreach_flow
      return @outreach_flow if defined?(@outreach_flow)

      id = chat.outreach_flow_id.presence
      flow = id && Flow.scoped(organization_id, id)
      @outreach_flow = flow&.published? ? flow : nil
    end

    def triggered_flows
      types = EVENT_TO_TRIGGER_TYPES.fetch(event, [])
      return [] if types.empty?

      Flow.published.for_organization(organization_id).where(trigger_type: types).select do |flow|
        flow.serves_connector?(chat.connector_id) && (flow.trigger_type != "keyword" || keyword_match?(flow))
      end
    end

    # As palavras moram no bloco de gatilho. A definição só é lida para quem tem esse gatilho.
    def keyword_match?(flow)
      node = flow.published_version&.trigger_node
      keywords = Array(node&.dig("data", "keywords"))
      KeywordMatcher.match?(text, keywords)
    end
  end
end
