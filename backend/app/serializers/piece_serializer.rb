class PieceSerializer < ApplicationSerializer
  def self.one(piece)
    manifest = piece.manifest
    stale = piece.stale_refs
    {
      id: piece.id,
      brandId: piece.brand_core_id,
      engineId: piece.engine_id,
      engineName: manifest ? manifest.as_json(locale: I18n.locale)["name"] : piece.engine_id,
      format: piece.format,
      title: piece.title,
      values: piece.values,
      status: piece.status,
      error: piece.error,
      provenance: piece.provenance,
      images: piece.images.attached? ? piece.images.order(:created_at).map.with_index(1) { |image, index|
        {
          index: index,
          url: Rails.application.routes.url_helpers.rails_storage_proxy_url(image, only_path: true)
        }
      } : [],
      stale: stale.any?,
      staleRefs: stale,
      outdated: piece.outdated?,
      brandCoreVersion: piece.provenance["brandCoreVersion"],
      renderedAt: epoch_ms(piece.rendered_at),
      createdAt: epoch_ms(piece.created_at),
      updatedAt: epoch_ms(piece.updated_at)
    }
  end

  def self.event(piece, event: "updated")
    { event: event, piece: one(piece) }
  end
end
