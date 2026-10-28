# O editor de uma peça-documento (`/brands/:brand_id/pieces/:id/...`).
#
#   PATCH document          o documento inteiro (o salvamento automático)
#   POST  operations        mudanças do vocabulário fechado, conferidas aqui
#   GET   versions          o histórico
#   POST  versions/:id/restore
#
# Toda gravação leva `baseVersionId`: se a versão atual já é outra (outra
# aba salvou antes), a resposta é 409 e nada é sobrescrito — sem tentativa de
# juntar. Cada gravação boa vira uma `PieceVersion` e enfileira o render.
class PieceDocumentsController < AuthenticatedController
  before_action :set_piece
  before_action :require_editable, only: %i[update operations restore]

  def update
    return render_conflict if stale?

    document = PieceDocument.normalize(
      params.require(:document).to_unsafe_h,
      piece_id: @piece.id, brand_id: @piece.brand_core_id,
      brand_core_version_id: @piece.document["brandCoreVersionId"]
    )
    check = PieceDocument::Validator.call(document, brand_core: @piece.brand_core)
    return render_document_invalid(check) unless check.valid?

    record(document, source: "user_edit", warnings: check.warnings)
  end

  def operations
    return render_conflict if stale?

    result = PieceDocument::Operations.apply(@piece.document, params.require(:operations).map(&:to_unsafe_h), brand_core: @piece.brand_core)
    return render json: { piece: PieceSerializer.one(@piece), applied: [], rejected: result.rejected } if result.applied.empty?

    source = result.applied.any? { |op| op["op"] == "set_layout" } ? "layout_change" : "user_edit"
    check = PieceDocument::Validator.call(result.document, brand_core: @piece.brand_core)
    record(result.document, source: source, warnings: check.warnings, extra: { applied: result.applied, rejected: result.rejected })
  end

  def versions
    list = @piece.versions.includes(:account).to_a
    by_id = list.index_by(&:id)
    render json: {
      currentVersionId: @piece.current_version_id,
      versions: list.reverse.map { |version|
        base = by_id[version.base_version_id]
        {
          id: version.id,
          source: version.source,
          summary: version.summary,
          changes: PieceDocument::Changes.call(base&.document, version.document),
          account: version.account && { id: version.account.id, name: version.account.name },
          createdAt: ApplicationSerializer.epoch_ms(version.created_at)
        }
      }
    }
  end

  # Restaurar é criar uma versão nova com o documento da antiga.
  def restore
    old = @piece.versions.find(params[:version_id])
    record(old.document, source: "restore", summary: old.created_at.iso8601)
  end

  private

  def set_piece
    brand = current_organization.brand_cores.find(params[:brand_id])
    @piece = brand.pieces.find(params[:id])
    render_not_document unless @piece.document?
  end

  # Só rascunho se edita; aprovada abre só para leitura.
  def require_editable
    return if @piece.status.in?(%w[draft generating failed])

    render_error(status: :unprocessable_entity, code: "pieceLocked", message: t("pieces.locked"))
  end

  def stale?
    params[:baseVersionId].to_s != @piece.current_version_id.to_s
  end

  def record(document, source:, warnings: [], summary: nil, extra: {})
    @piece.record_version!(document, source: source, summary: summary || params[:summary].presence, account: current_account)
    @piece.update!(status: "draft", error: nil) if @piece.status == "failed"
    # O render de cada gravação é o padrão (libvips): rápido e sem navegador.
    # O do navegador é sob pedido, no seletor de PNGs.
    RenderPieceJob.perform_later(@piece.id, PieceRenderers.default)
    render json: {
      piece: PieceSerializer.one(@piece.reload),
      versionId: @piece.current_version_id,
      warnings: warnings.map { |path, code, detail| { path: path, code: code, detail: detail }.compact }
    }.merge(extra)
  end

  def render_conflict
    render_error(status: :conflict, code: "conflict", message: t("pieces.conflict"),
      details: { "currentVersionId" => [ @piece.current_version_id.to_s ] })
  end

  def render_document_invalid(check)
    details = check.errors.each_with_object({}) { |(path, code, detail), map| (map[path] ||= []) << [ code, detail ].compact.join(":") }
    render_error(status: :unprocessable_entity, code: "unprocessable", field: details.keys.first,
      message: t("errors.messages.invalid"), details: details)
  end

  def render_not_document
    render_error(status: :unprocessable_entity, code: "unprocessable", message: t("errors.messages.invalid"))
  end
end
