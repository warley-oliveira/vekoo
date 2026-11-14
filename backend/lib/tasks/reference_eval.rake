# O teste lado a lado da Fase 3 (spec, "Fase 3 — plano aprovado"): as marcas
# de teste e as rodadas. Só no dev — as marcas ficam numa organização própria.
namespace :references do
  namespace :eval do
    eval_account = lambda do
      # O autor gravado é um vínculo (`Account`): o primeiro da pessoa, que é staff.
      email = ENV["ACCOUNT"].presence
      user = email ? User.find_by_login(email) : User.where(staff: true).order(:created_at).first
      account = user&.memberships&.order(:created_at)&.first
      account or abort "pessoa não encontrada, ou sem organização (ACCOUNT=email de uma pessoa staff)"
    end

    desc "Cria ou completa as marcas do teste (config/reference_eval/brands.yml): ONLY=padaria,burger PHOTOS=0 ACCOUNT=email"
    task brands: :environment do
      brands = References::Eval::Brands.new(account: eval_account.call, log: ->(line) { puts line }).call(
        only: ENV["ONLY"].to_s.split(",").presence, photos: ENV["PHOTOS"] != "0"
      )
      brands.each do |key, brand|
        archetypes = brand.generation_archetypes
        puts "#{key}: #{brand.name} · nicho #{brand.generation_niche} · estilo #{archetypes['primary']}/#{archetypes['secondary']} · " \
          "fotos #{brand.assets.where(kind: 'photo').count}"
      end
    end

    desc "Roda uma rodada do teste: ROUND=1 FILE=pedidos.json [CONTROLS=4] — gera cada pedido com e sem referência"
    task run: :environment do
      requests = JSON.parse(File.read(ENV.fetch("FILE")))
      run = References::Eval::Run.new(
        round: ENV.fetch("ROUND"), requests: requests, account: eval_account.call,
        controls: ENV.fetch("CONTROLS", References::Eval::Run::CONTROLS).to_i, log: ->(line) { puts line }
      )
      result = run.call
      puts "rodada #{ENV['ROUND']}: #{result.pairs.size} pares (#{result.pairs.count(&:control)} de controle) · " \
        "US$ #{format('%.2f', result.cost_micro_usd / 1e6)}"
      result.skipped.each { |line| puts "sem par: #{line}" }
      puts "As imagens chegam pelo Sidekiq. Avaliação em /admin/evals/#{ENV['ROUND']}."
    end
  end
end
