module Flows
  # A retenção do histórico: `flow_execution_logs` cresce uma linha por bloco, e `flow_executions` uma por rodada. Apaga em lotes
  # pequenos para não segurar a tabela, e os logs de cada execução vão em cascata.
  class PruneExecutionsJob < ApplicationJob
    queue_as :low

    RETENTION = 30.days
    PLAYGROUND_RETENTION = 1.day
    # Uma pergunta sem resposta há tanto tempo não é mais conversa. Sem isto, ela prenderia o fluxo nesta conversa para sempre.
    STALE_WAIT = 30.days
    # Toda execução aponta para a versão em que começou, então só a versão sem execução sai.
    VERSIONS_KEPT = 20
    BATCH = 1_000

    def perform
      expire_stale_waits
      in_batches(FlowExecution.finished.real_runs.where(completed_at: ...RETENTION.ago))
      in_batches(FlowExecution.playground_runs.where(updated_at: ...PLAYGROUND_RETENTION.ago))
      in_batches(FlowExecutionLog.where(executed_at: ...RETENTION.ago))
      prune_versions
    end

    private

    def expire_stale_waits
      FlowExecution.waiting_for_message.real_runs.where(updated_at: ...STALE_WAIT.ago).in_batches(of: BATCH) do |batch|
        batch.update_all(status: "cancelled", completed_at: Time.current, updated_at: Time.current)
      end
    end

    def in_batches(scope)
      scope.in_batches(of: BATCH) { |batch| batch.delete_all }
    end

    # Só de quem publica muito: as definições antigas nem o editor nem as execuções usam mais.
    def prune_versions
      Flow.joins(:versions).group(:id).having("COUNT(flow_versions.id) > ?", VERSIONS_KEPT).pluck(:id).each do |flow_id|
        keep = FlowVersion.where(flow_id: flow_id).order(version_number: :desc).limit(VERSIONS_KEPT).pluck(:id)
        in_use = FlowExecution.where(flow_id: flow_id).distinct.pluck(:flow_version_id)
        published = Flow.where(id: flow_id).pluck(:published_version_id)

        FlowVersion.where(flow_id: flow_id).where.not(id: keep + in_use + published).delete_all
      end
    end
  end
end
