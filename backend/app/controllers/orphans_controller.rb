# GET /orphans e POST /orphans/assign — a migração do legado: carrosséis e
# pastas de antes de existir marca. Some com `ORPHAN_MIGRATION=false` e, na
# tela, quando a organização zera os órfãos. Não é fluxo do produto.
class OrphansController < AuthenticatedController
  before_action :require_migration

  def index
    render json: payload
  end

  def assign
    brand = current_organization.brand_cores.find(params[:brandId])
    moved = OrphanMigration.assign!(current_organization, brand, carousel_ids: params[:carouselIds])
    render json: payload.merge(moved: moved)
  end

  private

  def require_migration
    render_not_found unless OrphanMigration.enabled?
  end

  def payload
    counts = OrphanMigration.counts(current_organization)
    {
      counts: counts,
      carousels: CarouselSerializer.many_summaries(current_organization.carousels.orphans.order(edited_at: :desc)),
      brands: BrandCoreSerializer.many_summaries(current_organization.brand_cores.ordered)
    }
  end
end
