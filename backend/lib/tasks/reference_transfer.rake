# O acervo da curadoria de um ambiente para outro (References::Transfer): cards
# com análise, vetor e miniatura, e as fotos descritas das marcas de teste.
namespace :references do
  desc "Exporta cards e fotos das marcas de teste: FILE=acervo.json [STATUS=in_review,published] [PHOTOS=0]"
  task export: :environment do
    statuses = ENV.fetch("STATUS", "in_review,published").split(",")
    payload = References::Transfer.export(cards: ReferenceCard.where(status: statuses).order(:created_at), photos: ENV["PHOTOS"] != "0")
    File.write(ENV.fetch("FILE"), payload.to_json)
    warn "#{payload['cards'].size} cards · #{payload['photos'].size} fotos → #{ENV['FILE']} (#{(File.size(ENV['FILE']) / 1e6).round(1)} MB)"
  end

  desc "Importa o arquivo do references:export: FILE=acervo.json (ou FILE=- pela entrada) ACCOUNT=email-da-curadoria"
  task import: :environment do
    # O curador gravado é um vínculo (`Account`): o primeiro da pessoa.
    account = User.find_by_login(ENV.fetch("ACCOUNT"))&.memberships&.order(:created_at)&.first
    account or abort "pessoa #{ENV['ACCOUNT']} não encontrada, ou sem organização"
    raw = ENV.fetch("FILE") == "-" ? $stdin.read : File.read(ENV["FILE"])
    counts = References::Transfer.import(JSON.parse(raw), account: account, log: ->(line) { puts line })
    puts counts.map { |key, value| "#{key}: #{value}" }.join(" · ")
  end
end
