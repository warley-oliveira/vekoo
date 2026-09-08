# A renderização de uma peça, em segundo plano (Sidekiq). O trabalho pesado
# é do `RenderPiece`; aqui só se acha a peça — que pode ter sido apagada
# enquanto esperava na fila.
class RenderPieceJob < ApplicationJob
  queue_as :default

  def perform(piece_id)
    piece = Piece.find_by(id: piece_id)
    RenderPiece.new(piece).call if piece
  end
end
