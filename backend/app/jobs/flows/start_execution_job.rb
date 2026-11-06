module Flows
  # Começa um fluxo. Pode tentar de novo sem medo: a chave de idempotência e o índice de "uma execução viva por conversa"
  # não deixam começar duas vezes.
  class StartExecutionJob < ApplicationJob
    queue_as :default

    retry_on StandardError, wait: :polynomially_longer, attempts: 3 do |job, error|
      Rails.logger.error("[Flows::StartExecutionJob] #{job.arguments.first} #{error.class}: #{error.message}")
    end

    # @param options [Hash] "message", "variables", "event", "idempotency_key"
    def perform(flow_id, organization_id, chat_id, options = {})
      flow = Flow.scoped(organization_id, flow_id)
      return Rails.logger.warn("[Flows::StartExecutionJob] fluxo #{flow_id} não encontrado") unless flow

      chat = chat_id.present? ? Chat.scoped(organization_id, chat_id) : nil
      return if chat_id.present? && chat.nil?

      FlowRuntime::Engine.start(
        flow: flow,
        chat: chat,
        last_message: FlowRuntime::InboundMessage.from_h(options["message"]),
        variables: options["variables"] || {},
        event: options["event"],
        idempotency_key: options["idempotency_key"]
      )
    end
  end
end
