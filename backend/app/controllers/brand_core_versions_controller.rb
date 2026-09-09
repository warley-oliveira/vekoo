# GET /brands/:brand_id/versions — o histórico de publicações: quem mudou, quando e
# o quê. Só leitura: versão nasce em `POST /brands/:id/publish`.
class BrandCoreVersionsController < AuthenticatedController
  def index
    brand_core = current_organization.brand_cores.find(params[:brand_id])
    versions = brand_core.versions.includes(:account)
    render json: { versions: BrandCoreVersionSerializer.many(versions) }
  end
end
