# A faxina das conversas antigas (`AgentConversation::RETENTION`).
#
# A conversa é andaime; a peça é obra. Apagar a conversa **não** apaga as
# peças que saíram dela: `pieces.agent_turn_id` é `on_delete: :nullify`.
class PurgeAgentConversationsJob < ApplicationJob
  queue_as :default

  def perform
    AgentConversation.stale.find_each(&:destroy)
  end
end
