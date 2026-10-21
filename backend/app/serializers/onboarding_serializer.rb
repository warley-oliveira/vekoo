# A conversa do onboarding como a tela a desenha: onde a pessoa está, e cada
# fala com a resposta do agente em códigos (`reply`) — a tela traduz.
class OnboardingSerializer < ApplicationSerializer
  def self.one(brand_core, conversation)
    {
      conversationId: conversation&.id,
      startedAt: epoch_ms(conversation&.created_at),
      state: state(brand_core),
      turns: conversation ? conversation.turns.map { |turn| turn(turn) } : []
    }
  end

  def self.state(brand_core)
    topic = brand_core.onboarding_topic
    {
      topic: topic,
      position: BrandCore::Onboarding.position(topic),
      total: BrandCore::Onboarding::QUESTION_COUNT,
      closed: brand_core.onboarding_closed,
      suggestible: BrandCore::Onboarding.suggestible?(topic),
      segment: brand_core.onboarding_segment,
      wantsWordmark: brand_core.wants_wordmark?,
      done: brand_core.onboarding_done?,
      readyToFinish: brand_core.onboarding_ready_to_finish?
    }
  end

  def self.turn(turn)
    plan = turn.plan || {}
    {
      id: turn.id,
      kind: turn.kind,
      status: turn.status,
      topic: plan["topic"],
      text: turn.prompt.presence,
      choice: plan["choice"],
      # De qual turno de propostas veio a escolha: a tela marca a escolhida lá.
      sourceTurnId: plan["sourceTurnId"],
      assetId: plan["assetId"],
      reply: turn.reply,
      error: turn.error&.dig("code"),
      createdAt: epoch_ms(turn.created_at)
    }
  end
end
