module Hooks
  # A ação de script de um webhook, na fila `scripts`: se o script derrubar o processo, cai este, e não quem entrega as mensagens.
  # Sem nova tentativa: script não é idempotente. As ações que vinham depois continuam na fila normal.
  class CodeRunnerJob < ApplicationJob
    queue_as :scripts

    discard_on StandardError do |job, error|
      Rails.logger.error("[Hooks::CodeRunnerJob] #{job.arguments.first} #{error.class}: #{error.message}")
    end

    # @param clean [Boolean] nada falhou até aqui: se o script também der certo, a entrega resolve o alerta anterior
    def perform(hook_id, organization_id, action_id, chat_id, capture_json, remaining_ids = [], log_id = nil, clean = true)
      hook = Hook.scoped(organization_id, hook_id)
      action = hook&.hook_actions&.find_by(id: action_id)
      return unless action

      chat = chat_id.present? ? Chat.scoped(organization_id, chat_id) : nil
      clean &&= run_script(hook, action, chat, JSON.parse(capture_json), log_id)

      # Com o resto ainda por vir, quem resolve é quem terminar.
      return ContinueActionsJob.perform_later(hook_id, organization_id, chat_id, capture_json, remaining_ids, log_id, clean) if remaining_ids.any?

      hook.resolve_failure_alert! if clean
    end

    private

    def run_script(hook, action, chat, capture, log_id)
      action.run_script(SlimJsonPath.fetch_all_slim(Capture.payload_of(capture)), chat)
      true
    rescue ::MiniRacer::Error, MiniRacerEngine::Error => e
      message = I18n.t("automation.hooks.errors.script_failed", reason: e.message.truncate(300))
      hook.alert_failure!(message)
      log_id && HookLog.for_organization(hook.organization_id).where(id: log_id).take&.set(status: "error", status_code: 500, error_message: message)
      false
    end
  end
end
