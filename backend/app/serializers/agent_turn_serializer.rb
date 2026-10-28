# Um turno da conversa como a tela o vê: o que foi pedido, o que o agente
# decidiu e o que isso custou.
#
# `variations` já vem com `pieceId`: a tela busca a imagem pelo caminho normal
# das peças, e por isso a galeria, o download e o "gerar de novo" funcionam
# sem nenhum código novo.
class AgentTurnSerializer < ApplicationSerializer
  def self.one(turn)
    {
      id: turn.id,
      conversationId: turn.agent_conversation_id,
      kind: turn.kind,
      status: turn.status,
      prompt: turn.prompt,
      basePieceId: turn.base_piece_id,
      attachments: turn.attachments,
      question: turn.question,
      variations: turn.variations,
      # O que o agente fez enquanto pensava — cada foto que pediu, com as que
      # já saíram no formato dos ativos da marca. É a trilha ao vivo da tela.
      steps: steps(turn),
      # A pessoa pediu foto, não peça: o resultado são as fotos da trilha.
      onlyImages: turn.only_images?,
      error: turn.error,
      creditsCharged: turn.credits_charged,
      # O custo real da chamada. Fica visível de propósito: é o número que
      # decide plano e limite, e esconder deixaria a conta invisível até a
      # fatura chegar.
      usage: turn.usage,
      costMicroUsd: turn.cost_micro_usd,
      model: turn.model,
      createdAt: epoch_ms(turn.created_at),
      updatedAt: epoch_ms(turn.updated_at)
    }
  end

  def self.steps(turn)
    list = turn.step_list
    return [] if list.empty?

    assets = BrandAsset.where(id: turn.generated_asset_ids).with_attached_file.index_by(&:id)
    list.map { |step|
      step.slice("id", "kind", "status", "caption", "aspectRatio", "count", "error", "startedAt", "finishedAt")
        .merge("assets" => BrandAssetSerializer.many(Array(step["assetIds"]).filter_map { |id| assets[id] }))
    }
  end

  def self.event(turn)
    { event: "turnUpdated", conversationId: turn.agent_conversation_id, turn: one(turn) }
  end
end
