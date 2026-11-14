namespace :agent do
  desc "Apaga conversas de criação antigas (30 dias); as peças ficam"
  task purge: :environment do
    stale = AgentConversation.stale.count
    PurgeAgentConversationsJob.perform_now
    puts "Conversas apagadas: #{stale}"
  end

  desc "Quanto cada organização gastou de modelo no mês corrente"
  task spend: :environment do
    puts "Teto: #{Agent::Budget.enabled? ? "#{Agent::Budget.cap_cents} centavos/mês" : 'desligado'}"
    Organization.find_each do |organization|
      cents = Agent::Budget.spent_cents(organization)
      next if cents.zero?

      puts format("  %-30s US$ %.2f", organization.name, cents / 100.0)
    end
  end
end
