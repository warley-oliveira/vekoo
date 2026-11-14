# As peças de uma marca (`/brands/:brand_id/pieces`). Criar valida os valores contra o manifesto na
# hora (a tela recebe o erro no campo certo) e enfileira a renderização;
# `regenerate` reaproveita os mesmos valores sobre a marca de hoje — é o
# caminho de quem vê "o preço mudou".
class PiecesController < AuthenticatedController
  include PieceErrors

  before_action :set_brand
  before_action :set_piece, only: %i[show destroy regenerate render_payload render_document]

  # GET /brands/:brand_id/pieces?engine=&outdated=
  def index
    pieces = @brand.pieces.with_attached_images.recent_first
    pieces = pieces.for_engine(params[:engine]) if params[:engine].present?
    list = pieces.to_a
    list = list.select(&:outdated?) if ActiveModel::Type::Boolean.new.cast(params[:outdated])
    render json: { pieces: PieceSerializer.many(list) }
  end

  def show
    render json: PieceSerializer.one(@piece)
  end

  def create
    payload = params.require(:piece)
    brand_core = @brand
    entry = Engines::Registry.fetch(payload[:engineId].to_s)
    tokens = Engines::Tokens.new(brand_core)
    result = Engines::Values.call(entry.manifest, payload[:values]&.to_unsafe_h, tokens: tokens)
    return render_values_invalid(result.errors) unless result.valid?

    piece = current_organization.pieces.new(
      brand_core: brand_core,
      account: current_account,
      engine_id: entry.id,
      format: payload[:format].to_s.presence || entry.manifest.formats.first,
      title: payload[:title].to_s.presence || entry.manifest.as_json(locale: I18n.locale)["name"],
      values: result.values
    )

    if piece.save
      RenderPieceJob.perform_later(piece.id)
      render json: PieceSerializer.one(piece), status: :created
    else
      render_invalid(piece)
    end
  end

  def destroy
    @piece.destroy!
    head :no_content
  end

  def regenerate
    if @piece.legacy?
      @piece.reset_for_render!
      RenderPieceJob.perform_later(@piece.id)
    else
      RenderPieceJob.perform_later(@piece.id, @piece.provenance["renderer"] || PieceRenderers.default)
    end
    render json: PieceSerializer.one(@piece), status: :accepted
  end

  # GET /brands/:brand_id/pieces/:id/render-payload — documento, tema da
  # marca publicada, arquivos e geometria: o que o React precisa para
  # desenhar a peça na tela (o mesmo que o Chromium do export recebe).
  def render_payload
    return render_legacy_piece unless @piece.document?

    render json: PieceRenderers.payload(@piece.current_version)
  end

  # POST /brands/:brand_id/pieces/:id/render { renderer: "react" | "libvips" }
  # — os PNGs da versão atual pelo renderizador escolhido (em segundo plano).
  def render_document
    return render_legacy_piece unless @piece.document?

    renderer = params[:renderer].to_s
    unless PieceRenderers::NAMES.include?(renderer)
      return render_error(status: :unprocessable_entity, code: "unprocessable", field: "renderer",
        message: t("errors.messages.inclusion"))
    end

    RenderPieceJob.perform_later(@piece.id, renderer)
    render json: PieceSerializer.one(@piece), status: :accepted
  end

  private

  def render_legacy_piece
    render_error(status: :unprocessable_entity, code: "unprocessable", message: t("errors.messages.invalid"))
  end

  def set_brand
    @brand = current_organization.brand_cores.find(params[:brand_id])
  end

  def set_piece
    @piece = @brand.pieces.find(params[:id])
  end
end
