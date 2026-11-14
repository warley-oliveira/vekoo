# O estado das peças ao vivo: o job termina, a organização inteira vê a
# imagem aparecer (ou a falha explicada) sem recarregar.
class PieceChannel < ApplicationCable::Channel
  def subscribed
    stream_for current_organization
  end
end
