# A conversa com o agente em segundo plano. A chamada ao modelo leva de
# segundos a dezenas de segundos: segurar uma thread do Puma por ela travaria
# a API para quem só quer entrar. A tela espera pelo `AgentChannel`.
#
# Duas conversas usam esta fila: a de criação de peças (`Agent::Run`) e a do
# onboarding (`Onboarding::Run`). Mesma infra, cabeças diferentes.
class AgentTurnJob < ApplicationJob
  queue_as :default

  def perform(turn_id)
    turn = AgentTurn.find_by(id: turn_id)
    # A conversa pode ter sido apagada enquanto o turno esperava na fila.
    return unless turn&.thinking?

    turn.conversation.onboarding? ? Onboarding::Run.new(turn).call : Agent::Run.new(turn).call
  end
end
