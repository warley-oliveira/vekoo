# POST /brand-core/assets e DELETE /brand-core/assets/:id — logos, glifos,
# fotos e arquivos de fonte da marca. Multipart, como `/uploads`.
#
# O arquivo é analisado na hora (dimensões e, no PNG, transparência real): o
# alerta de fundo opaco precisa vir na mesma resposta do upload.
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

    if asset.save
      AnalyzeBrandAsset.call(asset, file)
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
    @brand_core = BrandCore.for(current_organization)
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
