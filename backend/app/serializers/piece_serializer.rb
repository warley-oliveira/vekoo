class PieceSerializer < ApplicationSerializer
  def self.one(piece)
    manifest = piece.manifest
    {
      id: piece.id,
      brandId: piece.brand_core_id,
      # `document` é a peça de agora; `legacy` é a saída de um motor sem
      # equivalente em layout — só leitura, com as imagens que já tem.
      kind: piece.legacy? ? "legacy" : "document",
      document: piece.document,
      currentVersionId: piece.current_version_id,
      engineId: piece.engine_id,
      engineName: manifest ? manifest.as_json(locale: I18n.locale)["name"] : piece.engine_id,
      format: piece.format,
      title: piece.title,
      values: piece.values,
      status: piece.status,
      error: piece.error,
      provenance: piece.provenance,
      images: images(piece),
      # Peça-documento: os PNGs da versão atual por renderizador — o seletor
      # do front escolhe qual mostrar.
      renders: piece.document? ? renders(piece) : nil,
      outdated: piece.outdated?,
      brandCoreVersion: piece.provenance["brandCoreVersion"],
      renderedAt: epoch_ms(piece.rendered_at),
      createdAt: epoch_ms(piece.created_at),
      updatedAt: epoch_ms(piece.updated_at)
    }
  end

  # As imagens "da peça": a legada tem as dela; a de documento, as do
  # renderizador que desenhou por último a versão atual.
  def self.images(piece)
    if piece.legacy?
      return [] unless piece.images.attached?

      return piece.images.order(:created_at).map.with_index(1) { |image, index| { index: index, url: blob_url(image) } }
    end

    list = renders(piece)
    chosen = list[piece.provenance["renderer"]].presence || list.values.find(&:present?) || []
    chosen.map { |render| render.slice(:index, :url) }
  end

  def self.renders(piece)
    version = piece.current_version
    return {} unless version

    version.renders.with_attached_file.ordered.group_by(&:renderer).transform_values { |list|
      list.map { |render|
        { index: render.position + 1, slideId: render.slide_id, url: blob_url(render.file), width: render.width,
          height: render.height, renderedAt: epoch_ms(render.rendered_at), legibility: render.legibility }
      }
    }
  end

  def self.event(piece, event: "updated")
    { event: event, piece: one(piece) }
  end
end
