module Hooks
  # As ações que vinham depois de um script. O script rodou em outra fila, e o resto volta para esta.
  class ContinueActionsJob < ApplicationJob
    queue_as :default

    def perform(hook_id, organization_id, chat_id, capture, action_ids, log_id = nil, clean = true)
      hook = Hook.scoped(organization_id, hook_id)
      return unless hook

      chat = chat_id.present? ? Chat.scoped(organization_id, chat_id) : nil
      ActionPipeline.new(hook, capture, log_id: log_id).run(action_ids: action_ids, chat: chat, clean: clean)
    rescue StandardError => e
      Rails.logger.error("[Hooks::ContinueActionsJob] #{hook_id} #{e.class}: #{e.message}")
      hook&.alert_failure!(e.message)
    end
  end
end
