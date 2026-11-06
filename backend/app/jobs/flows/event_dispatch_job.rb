module Flows
  # Contato criado e transferência humana. Sem debounce, e com outra regra: a transferência acontece justamente com a automação
  # pausada, e um fluxo de `trigger_human_handoff` existe para rodar nessa hora. Só o interruptor da organização vale.
  class EventDispatchJob < ApplicationJob
    queue_as :default

    retry_on StandardError, wait: :polynomially_longer, attempts: 3 do |job, error|
      Rails.logger.error("[Flows::EventDispatchJob] #{job.arguments.first} #{error.class}: #{error.message}")
    end

    def perform(chat_id, organization_id, event, text = "")
      chat = Chat.scoped(organization_id, chat_id)
      return unless chat&.organization&.automation_enabled?
      return if event == "contact_created" && !chat.automation_enabled

      Dispatch.call(chat: chat, text: text, event: event)
    end
  end
end
