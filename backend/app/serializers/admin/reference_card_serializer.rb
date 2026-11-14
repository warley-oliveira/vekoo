# Um card do banco de referências como a curadoria o vê — inteiro, com fonte,
# custo da análise e achados. Só a área `/admin` usa este serializer.
module Admin
  class ReferenceCardSerializer < ApplicationSerializer
    def self.one(card)
      summary(card).merge(
        analysis: card.analysis,
        source: card.source,
        suggestedLayoutId: card.suggested_layout_id,
        archivedReason: card.archived_reason,
        analysisError: card.analysis_error,
        analysisModel: card.analysis_model,
        analysisCostMicroUsd: card.analysis_cost_micro_usd,
        analyzedAt: epoch_ms(card.analyzed_at),
        embeddedAt: epoch_ms(card.embedded_at),
        findings: card.findings,
        originalsCount: card.originals.size,
        curatedBy: card.curated_by && { id: card.curated_by.id, name: card.curated_by.name },
        publishedAt: epoch_ms(card.published_at)
      )
    end

    # A linha da lista: o bastante para filtrar, ordenar e reconhecer o card.
    def self.summary(card)
      {
        id: card.id,
        status: card.status,
        origin: card.origin,
        niche: card.niche,
        size: card.size,
        archetypes: card.archetypes,
        objective: card.objective,
        format: card.format,
        hookType: card.hook_type,
        replicability: card.replicability,
        relativeEngagement: card.relative_engagement&.to_f,
        version: card.version,
        analysisStatus: card.analysis_status,
        summary: card.analysis.dig("structure", "summary").to_s.first(160).presence,
        channel: card.source["channel"],
        hasThumbnail: card.thumbnail.attached?,
        # Veio de um vídeo: a análise viu só a capa e a legenda.
        partialAnalysis: card.partial_analysis,
        instagram: card.instagram?,
        embedded: card.embedded_at.present?,
        createdAt: epoch_ms(card.created_at),
        updatedAt: epoch_ms(card.updated_at)
      }
    end

    def self.list(cards)
      cards.map { |card| summary(card) }
    end
  end
end
