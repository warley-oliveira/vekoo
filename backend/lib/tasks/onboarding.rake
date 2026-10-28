namespace :onboarding do
  desc "O funil: em que tema as pessoas param, pulam, precisam de seguimento ou pedem ajuda à IA"
  task funnel: :environment do
    rows = OnboardingEvent.funnel
    puts format("%-13s %8s %8s %10s %8s %10s %8s", "tema", "chegou", "%", "respondeu", "pulou", "seguimento", "IA")
    rows.each do |row|
      puts format("%-13s %8d %7d%% %10d %8d %10d %8d",
        row["step"], row["reached"], row["reachPercent"], row["answered"], row["skipped"],
        row["followedUp"], row["suggested"])
    end

    cost = OnboardingEvent.cost_per_brand
    puts
    puts format("Marcas com onboarding: %d · custo médio de IA: US$ %.4f · total US$ %.2f",
      cost[:brands], cost[:averageMicroUsd] / 1e6, cost[:totalMicroUsd] / 1e6)
  end
end

namespace :fonts do
  desc "Baixa as fontes do catálogo para o cache local (o primeiro render não deveria esperar)"
  task warm: :environment do
    count = BrandFonts.warm
    puts "Arquivos em cache: #{count} (#{BrandFonts.root})"
  end

  desc "Regera o índice do Google Fonts (config/google_fonts.json + o espelho do front)"
  task directory: :environment do
    require "net/http"

    body = Net::HTTP.get(URI("https://fonts.google.com/metadata/fonts"))
    families = JSON.parse(body.sub(/\A\)\]\}'\n?/, "")).fetch("familyMetadataList")
    rows = BrandCore::FontDirectory.from_metadata(families)

    targets = [ BrandCore::FontDirectory::PATH, Rails.root.join("../frontend/src/lib/google-fonts.json") ]
    targets.each do |path|
      next unless path.dirname.exist?

      File.write(path, BrandCore::FontDirectory.dump(rows))
      puts "#{rows.size} famílias em #{path}"
    end
  end
end
