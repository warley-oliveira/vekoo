# POST /brands/:brand_id/assets e DELETE /brands/:brand_id/assets/:id — logos, glifos,
# fotos e arquivos de fonte da marca. Multipart, como `/uploads`.
#
# O arquivo é analisado na hora (dimensões e, no PNG, transparência real): o
# alerta de fundo opaco precisa vir na mesma resposta do upload.
#
# Logo entra num **grupo** (`logo_id`): `logoId` junta a variante a uma logo
# enviada que já existe (a versão escura da mesma logo); sem ele, é uma logo
# nova. `primary=true` a torna a principal no rascunho.
class BrandAssetsController < AuthenticatedController
  before_action :set_brand_core

  def create
    file = params.require(:file)
    kind = params[:kind].to_s
    return render_bad_kind unless BrandAsset::KINDS.include?(kind)

    content_type = BrandAsset.detect_type(kind, file)
    return render_unsupported_file(kind, file) unless content_type

    asset = @brand_core.assets.new(
      organization: current_organization,
      account: current_account,
      kind: kind,
      variant: params[:variant].presence,
      filename: file.original_filename,
      content_type: content_type,
      byte_size: file.size
    )
    asset.file.attach(io: file, filename: file.original_filename, content_type: content_type)
    group_logo(asset) if kind == "logo"

    if asset.save
      AnalyzeBrandAsset.call(asset, file)
      choose_logo(asset) if kind == "logo" && ActiveModel::Type::Boolean.new.cast(params[:primary])
      broadcast("assetsChanged")
      render json: BrandAssetSerializer.one(asset), status: :created
    else
      render_invalid(asset)
    end
  end

  def destroy
    asset = @brand_core.assets.find(params[:id])
    asset.destroy!
    broadcast("assetsChanged")
    head :no_content
  end

  private

  def set_brand_core
    @brand_core = current_organization.brand_cores.find(params[:brand_id])
  end

  # Só junta a logo **enviada**: o logotipo nosso é um desenho fechado.
  def group_logo(asset)
    target = params[:logoId].presence && @brand_core.logos.find_logo(params[:logoId])
    asset.logo_id = target && !target.generated? ? target.id : SecureRandom.uuid
    asset.meta = { "origin" => "upload" }
  end

  def choose_logo(asset)
    @brand_core.reload.choose_logo(asset.logo_id)
    @brand_core.save!
  end

  def render_bad_kind
    render_error(
      status: :unprocessable_entity,
      code: "unprocessable",
      field: "kind",
      message: t("brand_core.assets.bad_kind"),
      details: { "kind" => [ t("brand_core.assets.bad_kind") ] }
    )
  end

  def render_unsupported_file(kind, file)
    too_big = file.size.to_i > BrandAsset.max_bytes(kind)
    message = too_big ?
      t("brand_core.assets.too_large", max: helpers_number(BrandAsset.max_bytes(kind))) :
      t("brand_core.assets.unsupported_#{kind}")

    render_error(
      status: :unprocessable_entity,
      code: "unprocessable",
      field: "file",
      message: message,
      details: { "file" => [ message ] }
    )
  end

  def helpers_number(bytes)
    ActiveSupport::NumberHelper.number_to_human_size(bytes)
  end

  def broadcast(event)
    BrandCoreChannel.broadcast_to(
      current_organization,
      BrandCoreSerializer.event(@brand_core.reload, event: event, account: current_account,
        client_id: request.headers["X-Client-Id"])
    )
  end
end
