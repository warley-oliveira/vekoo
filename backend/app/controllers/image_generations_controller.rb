# A geração de imagens de uma marca (`/brands/:brand_id/image-generations`).
# O controlador confere marca, saldo e teto, reserva o crédito (por imagem) e
# enfileira; quem gera é o `GenerateImagesJob`. As fotos viram ativos da marca
# — o editor as enxerga em "trocar imagem".
class ImageGenerationsController < AuthenticatedController
  before_action :set_brand

  def index
    limit = params[:limit].present? ? params[:limit].to_i.clamp(1, 30) : 20
    list = @brand.image_generations.recent_first.limit(limit)
    list = list.where(origin: params[:origin]) if params[:origin].present?
    render json: { generations: ImageGenerationSerializer.many(list), available: Ai::GeminiImage.available?, costPerImage: cost_per_image }
  end

  def show
    render json: ImageGenerationSerializer.one(@brand.image_generations.find(params[:id]))
  end

  def create
    payload = params.require(:generation)
    prompt = payload[:prompt].to_s.strip
    return render_field("prompt", :blank) if prompt.empty?

    count = payload[:count].to_i.clamp(ImageGeneration::COUNTS.min, ImageGeneration::COUNTS.max)
    aspect = ImageGeneration::ASPECT_RATIOS.fetch(payload[:format].to_s, payload[:aspectRatio].to_s)
    reference = payload[:referenceAssetId].presence
    return render_field("referenceAssetId", :invalid) if reference && !@brand.assets.exists?(id: reference, kind: "photo")
    return render_unavailable unless Ai::GeminiImage.available?

    Agent::Budget.check!(current_organization)
    credits = count * cost_per_image
    current_organization.reserve_credits!(credits)

    generation = @brand.image_generations.create!(
      organization: current_organization, account: current_account, prompt: prompt.first(ImageGeneration::PROMPT_MAX),
      aspect_ratio: aspect, count: count, reference_asset_id: reference,
      origin: ImageGeneration::ORIGINS.include?(payload[:origin].to_s) ? payload[:origin].to_s : "studio",
      credits_charged: credits
    )
    GenerateImagesJob.perform_later(generation.id)
    render json: ImageGenerationSerializer.one(generation), status: :accepted
  rescue Organization::NoCreditsError
    render_error(status: :unprocessable_entity, code: "noCredits", message: t("credits.no_credits"))
  rescue Agent::Budget::CapReached
    Rails.logger.error("imagens: teto de custo do mês atingido (org #{current_organization.id})")
    render_error(status: :service_unavailable, code: "costCapReached", message: t("agent.cost_cap"))
  end

  private

  def set_brand
    @brand = current_organization.brand_cores.find(params[:brand_id])
  end

  def cost_per_image = CatalogSerializer::AI_COSTS[:image]

  def render_field(field, code)
    render_error(status: :unprocessable_entity, code: "unprocessable", field: field, message: t("errors.messages.#{code}"))
  end

  # Sem chave do Gemini o produto não quebra: a tela diz que a geração não
  # está disponível, e nada é cobrado.
  def render_unavailable
    render_error(status: :service_unavailable, code: "imageUnavailable", message: t("images.unavailable"))
  end
end
