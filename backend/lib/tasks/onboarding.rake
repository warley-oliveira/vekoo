namespace :onboarding do
  desc "O funil: em que pergunta as pessoas param, pulam ou pedem ajuda à IA"
  task funnel: :environment do
    rows = OnboardingEvent.funnel
    puts format("%-10s %8s %8s %10s %8s %8s", "pergunta", "chegou", "%", "respondeu", "pulou", "IA")
    rows.each do |row|
      puts format("%-10s %8d %7d%% %10d %8d %8d",
        row["step"], row["reached"], row["reachPercent"], row["answered"], row["skipped"], row["suggested"])
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
end
