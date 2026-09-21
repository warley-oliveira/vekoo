# A conversa de criação em segundo plano. A chamada ao modelo leva dezenas de
# segundos: segurar uma thread do Puma por ela travaria a API para quem só
# quer entrar. A tela espera pelo `AgentChannel`.
class AgentTurnJob < ApplicationJob
  queue_as :default

  def perform(turn_id)
    turn = AgentTurn.find_by(id: turn_id)
    # A conversa pode ter sido apagada enquanto o turno esperava na fila.
    Agent::Run.new(turn).call if turn&.thinking?
  end
end
