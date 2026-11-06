module Flows
  # Tudo que faz uma execução andar depois de parada:
  #
  #   "message"       chegou mensagem de quem esperava resposta
  #   "resume_token"  acabou o tempo de uma espera (`wait`)
  #   "run_token"     voltou do processo de scripts, com a execução ainda sob o mesmo dono
  #   "user_text"     mensagem no teste do editor
  #   "first_run"     o teste do editor começa a rodar, depois de a tela assinar o canal
  #
  # Só quem ganha a linha executa (ver FlowExecution.claim): a segunda mensagem, ou uma entrega repetida do job, não faz nada.
  class ResumeExecutionJob < ApplicationJob
    queue_as :default

    retry_on StandardError, wait: :polynomially_longer, attempts: 3 do |job, error|
      Rails.logger.error("[Flows::ResumeExecutionJob] #{job.arguments.first} #{error.class}: #{error.message}")
    end

    def perform(execution_id, organization_id, options = {})
      execution = FlowExecution.find_by(id: execution_id, organization_id: organization_id)
      return if execution.nil? || execution.finished?

      message = message_from(options)

      if options["run_token"].present?
        return unless execution.status == "running" && execution.run_token == options["run_token"]

        FlowRuntime::Engine.new(execution).run(last_message: message)
      elsif options["resume_token"].present?
        resume_after_wait(execution, options["resume_token"])
      elsif options["first_run"]
        FlowRuntime::Engine.resume(execution, last_message: message, from: "pending")
      else
        FlowRuntime::Engine.resume(execution, last_message: message, from: %w[waiting_for_message waiting])
      end
    end

    private

    def message_from(options)
      return FlowRuntime::InboundMessage.new(options["user_text"]) if options["user_text"].present?

      FlowRuntime::InboundMessage.from_h(options["message"])
    end

    # Uma pessoa assumiu durante a espera: o fluxo não pode falar por cima dela. O fluxo de transferência é a exceção, porque
    # ele existe para rodar com a automação pausada.
    def resume_after_wait(execution, token)
      return execution.cancel! if human_took_over?(execution) && execution.resume_token == token

      FlowRuntime::Engine.resume(execution, from: "waiting", resume_token: token)
    end

    def human_took_over?(execution)
      return false if execution.playground? || execution.flow.trigger_type == "human_handoff"

      chat = execution.chat
      chat.present? && !chat.automation_enabled
    end
  end
end
