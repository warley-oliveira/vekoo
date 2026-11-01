# Só leitura: o estado do tempo real em produção, para comparar antes e depois
# do hotfix do Redis. Sidekiq (contagens e retry agrupado pelo erro) e o banco
# numa transação READ ONLY que termina em rollback. Como rodar: DEPLOY.md,
# "Em andamento" (passo 1). Escrito contra o schema da e6c2eb9.
require "sidekiq/api"
TZ = "America/Sao_Paulo"
at = ->(epoch) { epoch ? Time.at(epoch).in_time_zone(TZ).strftime("%d/%m %H:%M") : "—" }

puts "medição em #{Time.current.in_time_zone(TZ).strftime('%d/%m/%Y %H:%M:%S')} (#{TZ})"
stats = Sidekiq::Stats.new
puts "sidekiq: processados #{stats.processed} · falhas #{stats.failed} · fila #{stats.enqueued} · " \
     "agendados #{stats.scheduled_size} · retry #{stats.retry_size} · mortos #{stats.dead_size}"

[ Sidekiq::RetrySet.new, Sidekiq::DeadSet.new ].each do |set|
  groups = set.group_by { |job| [ job.display_class, job.item["error_class"] ] }
  puts "#{set.name}: #{groups.empty? ? 'vazio' : "#{set.size} jobs"}"
  groups.each do |(klass, error), jobs|
    failed = jobs.map { |job| job.item["failed_at"] }.compact
    puts "  #{klass} · #{error} · #{jobs.size} · falharam entre #{at[failed.min]} e #{at[failed.max]}"
  end
end

ActiveRecord::Base.transaction do
  ActiveRecord::Base.connection.execute("SET TRANSACTION READ ONLY")
  puts "peças por status: #{Piece.group(:status).count.sort.to_h.inspect}"
  puts "turnos do agente por status (7 dias): #{AgentTurn.where(created_at: 7.days.ago..).group(:status).count.sort.to_h.inspect}"
  raise ActiveRecord::Rollback
end
