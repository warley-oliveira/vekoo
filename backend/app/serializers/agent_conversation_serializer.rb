# A conversa de criação. `one` traz os turnos (é o que a tela desenha);
# `summary` é o bastante para a lista lateral de conversas.
class AgentConversationSerializer < ApplicationSerializer
  def self.one(conversation)
    {
      id: conversation.id,
      brandId: conversation.brand_core_id,
      title: conversation.title,
      turns: AgentTurnSerializer.many(conversation.turns),
      createdAt: epoch_ms(conversation.created_at),
      lastTurnAt: epoch_ms(conversation.last_turn_at || conversation.created_at)
    }
  end

  def self.summary(conversation)
    {
      id: conversation.id,
      brandId: conversation.brand_core_id,
      title: conversation.title,
      turnCount: conversation.turns.size,
      createdAt: epoch_ms(conversation.created_at),
      lastTurnAt: epoch_ms(conversation.last_turn_at || conversation.created_at)
    }
  end

  def self.many_summaries(conversations)
    conversations.map { |conversation| summary(conversation) }
  end
end
