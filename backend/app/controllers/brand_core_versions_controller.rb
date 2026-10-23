# GET /brands/:brand_id/versions — o histórico de publicações: quem mudou, quando e
# o quê. Versão nasce em `POST /brands/:id/publish`.
class BrandCoreVersionsController < AuthenticatedController
  before_action :set_brand

  def index
    versions = @brand.versions.includes(:account)
    render json: { versions: BrandCoreVersionSerializer.many(versions) }
  end

  # POST /brands/:brand_id/versions/:id/restore — "restaurar": o documento
  # daquela versão volta para o **rascunho**. Não publica nem cria versão; o
  # motor segue lendo a publicação atual até alguém publicar de novo.
  def restore
    version = @brand.versions.find(params[:id])
    @brand.document = BrandCore::Schema.complete(version.snapshot)
    @brand.save!

    BrandCoreChannel.broadcast_to(
      current_organization,
      BrandCoreSerializer.event(@brand, event: "updated", account: current_account,
        client_id: request.headers["X-Client-Id"])
    )
    render json: BrandCoreSerializer.one(@brand)
  end

  private

  def set_brand
    @brand = current_organization.brand_cores.find(params[:brand_id])
  end
end
