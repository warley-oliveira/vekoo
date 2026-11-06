module Flows
  # O bloco que roda JavaScript de cliente, na fila `scripts`: se um script derrubar o processo, cai este, e não quem entrega as
  # mensagens. Faz só aquele bloco e devolve a execução para a fila normal. Sem nova tentativa: script não é idempotente.
  class ScriptStepJob < ApplicationJob
    queue_as :scripts

    discard_on StandardError do |job, error|
      Rails.logger.error("[Flows::ScriptStepJob] #{job.arguments.first} #{error.class}: #{error.message}")
      FlowExecution.find_by(id: job.arguments.first, organization_id: job.arguments.second)&.fail!(error.message)
    end

    def perform(execution_id, organization_id, run_token, message = nil)
      execution = FlowExecution.find_by(id: execution_id, organization_id: organization_id)
      return unless execution && execution.status == "running" && execution.run_token == run_token

      FlowRuntime::Engine.new(execution, script_process: true).run(last_message: FlowRuntime::InboundMessage.from_h(message))
    end
  end
end
