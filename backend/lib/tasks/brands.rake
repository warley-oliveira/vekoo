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

  desc "Deduz identity.niche no rascunho das marcas nunca publicadas (as publicadas usam a dedução na busca). DRY_RUN=1 só relata."
  task infer_niche: :environment do
    dry = ENV["DRY_RUN"].present?
    counts = Hash.new(0)

    BrandCore.where.not(status: "published").find_each do |brand|
      identity = brand.full_document["identity"]
      next counts[:already] += 1 if identity["niche"].present?

      niche = BrandCore::NicheInference.call(brand.full_document, segment_code: brand.onboarding_segment)
      next counts[:none] += 1 unless niche

      puts "  #{brand.id} #{identity['name'].presence || '(sem nome)'} — #{identity['segment'].presence || '(sem ramo)'} → #{niche}"
      next counts[:filled] += 1 if dry

      errors = brand.assign_section("identity", identity.merge("niche" => niche))
      if errors.any?
        puts "    recusada: #{errors.map(&:first).join(', ')}"
        next counts[:refused] += 1
      end
      brand.save!
      counts[:filled] += 1
    end

    verb = dry ? "a preencher" : "preenchidas"
    puts "#{verb}: #{counts[:filled]} · sem pista: #{counts[:none]} · já tinham: #{counts[:already]} · recusadas: #{counts[:refused]}"
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
