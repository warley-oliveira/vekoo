namespace :taxonomy do
  desc "Gera frontend/src/lib/taxonomy.ts a partir de config/reference_taxonomy.yml"
  task export: :environment do
    File.write(Taxonomy::TYPESCRIPT_PATH, Taxonomy.typescript)
    puts "escrito #{Taxonomy::TYPESCRIPT_PATH.cleanpath}"
  end
end
