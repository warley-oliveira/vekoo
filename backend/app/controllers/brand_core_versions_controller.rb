# GET /brand-core/versions — o histórico de publicações: quem mudou, quando e
# o quê. Só leitura: versão nasce em `POST /brand-core/publish`.
class BrandCoreVersionsController < AuthenticatedController
  def index
    brand_core = BrandCore.for(current_organization)
    versions = brand_core.versions.includes(:account)
    render json: { versions: BrandCoreVersionSerializer.many(versions) }
  end
end
