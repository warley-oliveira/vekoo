module Flows
  # Encerra o que estava em andamento: o fluxo foi arquivado, ou o contexto da conversa foi limpo. O job agendado de uma
  # espera continua na fila até a hora marcada, e aí não faz nada: o token dele não confere mais.
  module CancelActive
    module_function

    def for_flow(flow)
      cancel(flow.executions.active.real_runs)
    end

    def for_chat(chat)
      return 0 if chat.organization_id.blank?

      cancel(FlowExecution.active.for_chat(chat.organization_id, chat.id).real_runs)
    end

    def cancel(scope)
      now = Time.current
      scope.update_all(
        status: "cancelled", completed_at: now, updated_at: now, run_token: nil, locked_at: nil, resume_token: nil, resume_at: nil
      )
    end
    private_class_method :cancel
  end
end
