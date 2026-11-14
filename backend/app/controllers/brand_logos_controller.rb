require "vips"

# As logos da marca além do upload (`/brands/:id/assets`).
#
#   POST /brands/:brand_id/logos/generate — "regenerar": as três opções do
#     logotipo, desenhadas com a marca **atual** (o rascunho). Entram como
#     logos novas; nenhuma é apagada e a principal não muda — a pessoa escolhe.
#     Marca que não tinha logo nenhuma fica com a primeira, como no onboarding.
#   GET  /brands/:brand_id/logos/:id/download?variant=&format=&size= — o
#     arquivo para baixar, com nome da marca. Passa pela sessão: só quem é da
#     organização baixa.
class BrandLogosController < AuthenticatedController
  before_action :set_brand

  def generate
    first_logo = @brand.logos.none?
    logo_ids = RenderWordmark.options!(@brand, account: current_account, origin: "brand")
    return render_generate_failed if logo_ids.empty?

    if first_logo
      @brand.choose_logo(logo_ids.first)
      @brand.save!
    end

    BrandCoreChannel.broadcast_to(
      current_organization,
      BrandCoreSerializer.event(@brand.reload, event: "assetsChanged", account: current_account,
        client_id: request.headers["X-Client-Id"])
    )
    render json: { logoIds: logo_ids, brandCore: BrandCoreSerializer.one(@brand) }, status: :created
  end

  def download
    logo = @brand.logos.find_logo(params[:id])
    raise ActiveRecord::RecordNotFound unless logo

    option = BrandLogoSerializer.downloads(logo).find { |item|
      item[:variant] == params[:variant] && item[:format] == params[:format] && item[:size].to_s == params[:size].to_s
    }
    return render_download_missing unless option

    asset = logo.variant(option[:variant])
    data, type = file_for(asset, option)
    send_data data, type: type, disposition: "attachment", filename: filename(option)
  end

  private

  def set_brand
    @brand = current_organization.brand_cores.find(params[:brand_id])
  end

  # SVG vai como veio. PNG sai do original (SVG rasterizado, ou PNG reduzido)
  # na largura pedida — o libvips das peças, com a transparência intacta.
  def file_for(asset, option)
    original = asset.file.download
    return [ original, "image/svg+xml" ] if option[:format] == "svg"
    return [ original, "image/png" ] if option[:size].nil? || asset.width.to_i == option[:size]

    png = Vips::Image.thumbnail_buffer(original, option[:size], height: 10_000).write_to_buffer(".png")
    [ png, "image/png" ]
  end

  def filename(option)
    slug = @brand.name.to_s.parameterize.presence || "marca"
    size = option[:size] ? "-#{option[:size]}" : ""
    "#{slug}-logo-#{option[:variant]}#{size}.#{option[:format]}"
  end

  def render_generate_failed
    render_error(status: :unprocessable_entity, code: "unprocessable", field: "name",
      message: t("onboarding.wordmark_failed"))
  end

  def render_download_missing
    render_error(status: :not_found, code: "notFound", message: t("errors.not_found"))
  end
end
