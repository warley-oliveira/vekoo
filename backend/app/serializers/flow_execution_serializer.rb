class FlowExecutionSerializer < ApplicationSerializer
  def self.one(execution)
    {
      id: execution.id,
      flowId: execution.flow_id,
      status: execution.status,
      chatId: execution.chat_id,
      contactId: execution.contact_id,
      currentNodeId: execution.current_node_id,
      startedAt: epoch_ms(execution.started_at),
      completedAt: epoch_ms(execution.completed_at)
    }
  end

  # `context` sai como está: as variáveis têm nomes que a pessoa escolheu.
  def self.full(execution, logs)
    one(execution).merge(
      context: execution.context,
      errorMessage: execution.error_message,
      logs: logs.map { |log| log_entry(log) }
    )
  end

  def self.log_entry(log)
    {
      id: log.id,
      nodeId: log.node_id,
      nodeType: log.node_type,
      status: log.status,
      input: log.input,
      output: log.output,
      durationMs: log.duration_ms,
      executedAt: epoch_ms(log.executed_at),
      errorMessage: log.error_message
    }
  end
end
