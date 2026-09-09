# A migração do legado: carrosséis e pastas de antes de existir marca.
#
# Ferramenta temporária, não fluxo do produto: a rota e a tela só existem
# enquanto `ORPHAN_MIGRATION` não for "false", e a tela some sozinha quando
# a organização zera os órfãos. Depois da migração, apaga-se este arquivo,
# o controlador e a rota.
module OrphanMigration
  module_function

  def enabled?
    ENV.fetch("ORPHAN_MIGRATION", "true") != "false"
  end

  def counts(organization)
    {
      carousels: organization.carousels.orphans.count,
      folders: organization.folders.orphans.count
    }
  end

  # Entrega os órfãos da organização a uma marca dela. Sem `carousel_ids`,
  # todos; pastas vão sempre juntas (um carrossel sem a pasta dele não faz
  # sentido em marca nenhuma).
  def assign!(organization, brand, carousel_ids: nil)
    raise ArgumentError, "marca de outra organização" unless brand.organization_id == organization.id

    Carousel.transaction do
      scope = organization.carousels.orphans
      scope = scope.where(id: carousel_ids) if carousel_ids.present?
      moved = scope.update_all(brand_core_id: brand.id, updated_at: Time.current)
      organization.folders.orphans.update_all(brand_core_id: brand.id, updated_at: Time.current)
      moved
    end
  end

  # Quem tem uma marca só não precisa escolher: tudo vai para ela.
  def migrate_unambiguous!
    Organization.find_each.sum do |organization|
      brands = organization.brand_cores.to_a
      next 0 unless brands.length == 1 && counts(organization).values.sum.positive?

      assign!(organization, brands.first)
    end
  end
end
