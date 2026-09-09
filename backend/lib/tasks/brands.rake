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
end
