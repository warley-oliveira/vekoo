namespace :chats do
  desc <<~DESC
    Aplica nas conversas de uma organização as etiquetas de sistema, a partir do que já aconteceu.

    Uso:
      bin/rails "chats:backfill_system_tags[<organization_id>]"            # últimos 8 meses
      MONTHS=12 bin/rails "chats:backfill_system_tags[<organization_id>]"  # outra janela
      DRY_RUN=true bin/rails "chats:backfill_system_tags[<organization_id>]"
  DESC
  task :backfill_system_tags, [ :organization_id ] => :environment do |_task, args|
    abort("Informe o id da organização.") if args[:organization_id].blank?

    months = (ENV["MONTHS"].presence || Chats::BackfillSystemTagsService::DEFAULT_MONTHS).to_i
    abort("MONTHS precisa ser um inteiro positivo.") unless months.positive?

    organization = Organization.find_by(id: args[:organization_id]) || abort("Organização não encontrada.")
    stats = Chats::BackfillSystemTagsService.new(organization, months: months, dry_run: ENV["DRY_RUN"] == "true").call

    puts "#{organization.name}: últimos #{months} meses#{' (sem gravar)' if ENV['DRY_RUN'] == 'true'}"
    stats.sort.each { |key, value| puts "  #{key}: #{value}" }
  end
end
