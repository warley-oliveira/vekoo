# Os símbolos do "cria pra mim" da logo, fora do turno do onboarding: o resumo
# sai na hora com o logotipo só com o nome, e as logos com símbolo chegam
# depois, uma direção de cada vez, no mesmo bloco de opções (`Logos::Concepts`).
# Cada chegada regrava o turno e avisa a tela pelo `AgentChannel`.
#
# No bloco de opções: `pending` é quantas direções ainda estão vindo e
# `failed` quantas não saíram — a tela mostra o espaço de quem está vindo e
# um aviso curto de quem falhou.
class LogoConceptsJob < ApplicationJob
  queue_as :default

  def perform(turn_id)
    turn = AgentTurn.find_by(id: turn_id) or return
    brand = turn.conversation.brand_core

    Agent::Budget.check!(turn.organization)
    result = Logos::Concepts.new(
      brand, account: turn.account,
      on_concept: ->(_direction, logo_ids) { arrived(turn, brand, logo_ids) },
      on_failure: ->(_direction) { update(turn) { |options| settle(options, failed: 1) } }
    ).call
    turn.update_columns(cost_micro_usd: turn.cost_micro_usd.to_i + result.cost_micro_usd)
  rescue Agent::Budget::CapReached
    update(turn) { |options| settle(options, failed: options["pending"].to_i) }
  ensure
    # Acabou (bem ou mal): nada mais fica "chegando" na tela.
    update(turn) { |options| options["pending"] = 0 } if turn
  end

  private

  def arrived(turn, brand, logo_ids)
    update(turn) do |options|
      options["items"] = Array(options["items"]) + logo_ids.map { |id|
        concept = brand.logos.find_logo(id)&.variant("light")&.meta.to_h["concept"].to_h
        { "logoId" => id, "style" => nil, "concept" => concept.slice("direction", "arrangement", "idea") }
      }
      settle(options, failed: 0)
    end
  end

  # Uma direção a menos vindo; `failed` delas não saíram.
  def settle(options, failed:)
    options["pending"] = [ options["pending"].to_i - [ failed, 1 ].max, 0 ].max
    options["failed"] = options["failed"].to_i + failed
  end

  # O bloco de opções da logo no turno, regravado com trava: os símbolos
  # chegam um de cada vez.
  def update(turn)
    turn.with_lock do
      reply = Array(turn.plan["reply"])
      options = reply.find { |item| item["type"] == "options" && item["kind"] == "wordmark" }
      next unless options

      yield options
      turn.update!(plan: turn.plan.merge("reply" => reply))
    end
    AgentChannel.broadcast_to(turn.organization, AgentTurnSerializer.event(turn.reload))
  end
end
