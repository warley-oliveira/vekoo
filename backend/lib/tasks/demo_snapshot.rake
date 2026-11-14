# O retrato do banco de desenvolvimento que `bin/rails db:seed` aplica (ver lib/demo_snapshot.rb).
namespace :db do
  namespace :snapshot do
    desc "Grava o banco de desenvolvimento (Postgres, Mongo e arquivos) em db/seeds/snapshot/, com datas relativas"
    task dump: :environment do
      abort "db:snapshot:dump só em development (é o banco de desenvolvimento que vira a demonstração)" unless Rails.env.development?

      counts = DemoSnapshot.dump!(log: ->(line) { puts "  #{line}" })
      puts "Retrato gravado em #{DemoSnapshot::ROOT.relative_path_from(Rails.root)}: " \
        "#{counts[:rows]} linhas em #{counts[:tables]} tabelas, #{counts[:documents]} documentos em " \
        "#{counts[:collections]} coleções, #{counts[:files]} arquivos."
    end

    desc "Aplica o retrato de db/seeds/snapshot/ (upsert por id, datas andando com o tempo) — o mesmo que db:seed faz"
    task load: :environment do
      abort "Sem retrato em #{DemoSnapshot::ROOT}: rode db:snapshot:dump antes." unless DemoSnapshot.present?

      result = DemoSnapshot.load!(log: ->(line) { puts "  #{line}" })
      puts "Retrato aplicado: #{result[:tables]} tabelas, #{result[:collections]} coleções, datas +#{result[:days]} dia(s)."
    end
  end
end
