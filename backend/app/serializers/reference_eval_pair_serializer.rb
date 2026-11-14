# O par do teste lado a lado como a curadoria o vê: o pedido, a marca e as
# peças de cada lado — **nunca** o braço (`*_arm`) nem se é par de controle.
# Quem avalia não pode saber que lado tem referência.
class ReferenceEvalPairSerializer < ApplicationSerializer
  def self.list(pairs)
    pairs.map { |pair|
      {
        id: pair.id,
        position: pair.position,
        requestText: pair.request_text,
        brandName: pair.brand_core.name,
        decided: pair.decided?
      }
    }
  end

  def self.one(pair)
    siblings = ReferenceEvalPair.in_round(pair.round).pluck(:id, :verdict)
    index = siblings.index { |id, _| id == pair.id }
    pending = siblings.rotate(index + 1).find { |id, verdict| verdict.nil? && id != pair.id }
    brand = BrandCore::Schema.complete(pair.brand_core.published_document || pair.brand_core.document)["identity"]

    {
      id: pair.id,
      round: pair.round,
      position: pair.position,
      total: siblings.size,
      requestText: pair.request_text,
      brand: { name: brand["name"], segment: brand["segment"], niche: brand["niche"].presence, archetypes: brand["archetypes"] },
      left: side(pair.left_piece_ids),
      right: side(pair.right_piece_ids),
      verdict: pair.verdict,
      usableLeft: pair.usable_left,
      usableRight: pair.usable_right,
      reasons: pair.reasons,
      copiedSides: pair.copied_sides,
      notes: pair.notes,
      decidedAt: epoch_ms(pair.decided_at),
      previousId: index.positive? ? siblings[index - 1].first : nil,
      nextId: siblings[index + 1]&.first,
      nextPendingId: pending&.first
    }
  end

  # As peças na ordem em que o agente as entregou, com o que a pessoa veria na
  # tela de criação: as lâminas, a legenda e o "porquê" de cada opção.
  def self.side(ids)
    pieces = Piece.where(id: ids).includes(:agent_turn).index_by(&:id)
    ids.filter_map { |id| pieces[id] }.map { |piece|
      images = PieceSerializer.images(piece)
      caption = piece.document.to_h["caption"].to_h
      {
        id: piece.id,
        title: piece.title,
        format: piece.format,
        images: images,
        rendering: images.empty?,
        caption: caption["text"].presence,
        hashtags: Array(caption["hashtags"]),
        why: why(piece)
      }
    }
  end

  def self.why(piece)
    Array(piece.agent_turn&.plan.to_h["variations"]).find { |variation| variation["pieceId"] == piece.id }&.dig("why")
  end
end
