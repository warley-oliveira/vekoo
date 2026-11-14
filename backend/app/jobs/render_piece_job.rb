# A renderização de uma peça, em segundo plano (Sidekiq). A peça legada
# (motor) vai pelo `RenderPiece`; a peça-documento, pelo `RenderPieceDocument`
# com o renderizador pedido. Aqui só se acha a peça — que pode ter sido
# apagada enquanto esperava na fila.
class RenderPieceJob < ApplicationJob
  queue_as :default

  def perform(piece_id, renderer = nil)
    piece = Piece.find_by(id: piece_id)
    return unless piece

    if piece.legacy?
      RenderPiece.new(piece).call
    else
      RenderPieceDocument.new(piece, renderer: renderer || PieceRenderers.default).call
    end
  end
end
