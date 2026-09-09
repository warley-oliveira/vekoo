# GET /engines — o catálogo de motores (manifestos validados no boot).
# POST /brands/:brand_id/engines/:id/preview — a prévia da peça com os valores em edição,
# sem persistir nada: devolve o PNG do primeiro quadro.
class EnginesController < AuthenticatedController
  include PieceErrors

  def index
    render json: EngineSerializer.catalog(Engines::Registry.all.values)
  end

  def show
    render json: EngineSerializer.one(Engines::Registry.fetch(params[:id]))
  end

  def preview
    payload = params.require(:piece)
    png = RenderPiece.preview(
      current_organization.brand_cores.find(params[:brand_id]),
      params[:id],
      payload[:values]&.to_unsafe_h,
      payload[:format].to_s.presence || "post"
    )
    send_data png, type: "image/png", disposition: "inline"
  end
end
