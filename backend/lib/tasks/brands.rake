namespace :brands do
  desc "Entrega carrosséis e pastas sem marca à única marca da organização (quem tem várias usa a tela de migração)"
  task migrate_orphans: :environment do
    moved = OrphanMigration.migrate_unambiguous!
    puts "Carrosséis atribuídos: #{moved}"
    Organization.find_each do |organization|
      counts = OrphanMigration.counts(organization)
      next if counts.values.sum.zero?

      puts "  #{organization.name}: #{counts[:carousels]} carrosséis e #{counts[:folders]} pastas ainda sem marca (#{organization.brand_cores.count} marcas)"
    end
  end

  desc "Gera o PNG de tela dos SVGs enviados antes de existir o preview (idempotente)"
  task svg_previews: :environment do
    BrandAsset.where(content_type: "image/svg+xml").find_each do |asset|
      next if asset.preview.attached?

      AnalyzeBrandAsset.call(asset, nil)
      puts "#{asset.id} #{asset.filename}: #{asset.preview.attached? ? 'ok' : 'falhou'}"
    end
  end
end
