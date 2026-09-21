# O turno da conversa ao vivo: o job termina de pensar e a tela recebe as
# variações (ou a pergunta, ou a falha) sem recarregar. As **imagens** de cada
# variação continuam chegando pelo `PieceChannel` — o agente decide, o motor
# desenha, e são dois tempos diferentes.
class AgentChannel < ApplicationCable::Channel
  def subscribed
    stream_for current_account.organization
  end
end
