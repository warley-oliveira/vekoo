# O teste do editor em tempo real: { kind, ... } de cada bloco que entra e sai, das mensagens e das decisões da IA. Ver
# docs/migration/api/automation.md. Só quem pode ver fluxos, e só execução de teste da própria organização.
class FlowPlaygroundChannel < ApplicationCable::Channel
  def subscribed
    return reject unless current_account.can?(:flows)

    @execution = FlowExecution.playground_runs.find_by(id: params[:executionId] || params[:execution_id], organization_id: current_organization.id)
    return reject unless @execution

    stream_from FlowRuntime::MessageDispatcher.playground_stream(@execution)
  rescue StandardError => e
    Rails.logger.error(e.full_message)
    reject
  end

  def unsubscribed
    stop_all_streams
  end

  # { text }: a mensagem do contato de mentira.
  def speak(data)
    return unless @execution

    text = data["text"].to_s
    return if text.blank?

    ActionCable.server.broadcast(
      FlowRuntime::MessageDispatcher.playground_stream(@execution),
      { kind: "user_message", body: text, at: Time.current.iso8601 }
    )
    Flows::ResumeExecutionJob.perform_later(@execution.id, @execution.organization_id, { "user_text" => text })
  end
end
