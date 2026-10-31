namespace :references do
  # O Passo 0 da importação: uma chamada real à Business Discovery, com o
  # token do ambiente. Mostra o que voltou — nunca o token nem a legenda.
  desc "Confere a Business Discovery com o token do ambiente: bin/rails 'references:instagram_smoke[@conta]'"
  task :instagram_smoke, [ :username ] => :environment do |_, args|
    status = InstagramGraph::TokenStatus.read(InstagramGraph::Client.new, Time.current)
    puts "token: #{status[:state]}#{" · faltam permissões: #{status[:missingScopes].join(', ')}" if status[:missingScopes].present?}"
    puts "  vence: #{status[:expiresAt] ? Time.at(status[:expiresAt] / 1000).to_date : 'nunca'} · acesso aos dados: #{status[:dataAccessExpiresAt] ? Time.at(status[:dataAccessExpiresAt] / 1000).to_date : 'sem prazo'}"

    discovery = InstagramGraph::Client.new.discover(args[:username])
    media = discovery.media
    ranking = References::InstagramRanking.call(media)
    puts "conta: @#{discovery.account.username} · #{discovery.account.followers_count} seguidores · #{discovery.account.media_count} posts"
    puts "  lidos #{media.length} · com curtidas #{media.count(&:like_count)} · com comentários #{media.count(&:comments_count)}"
    puts "  carrosséis #{media.count(&:carousel?)} (lâminas lidas: #{media.select(&:carousel?).sum { |m| m.children.length }}) · vídeos #{media.count(&:video?)} (sem media_url: #{media.count { |m| m.video? && m.media_url.blank? }})"
    puts "  elegíveis (7+ dias) #{ranking.eligible} · mediana #{ranking.median&.round(1) || '—'} · 1,5x ou mais: #{ranking.candidates.count { |c| c.relative.to_f >= ReferenceCandidate::HIGHLIGHT }}"
    puts "Business Discovery liberada com este token. Passo 0 ok."
  rescue InstagramGraph::Client::Error => e
    puts "erro: #{e.code} — #{e.message}"
    if e.code == "permissionDenied"
      puts "O acesso Standard não liberou dado de terceiros. PARE: o caminho passa a ser App Review com verificação da empresa."
    end
    exit 1
  end

  # Quando o critério de gancho ou de replicabilidade muda
  # (`References::Prompts::CALIBRATION`): refaz os dois campos de todo card
  # analisado e, depois, o vetor de cada um — um por vez, com folga, porque a
  # cota de embedding do Vertex é por minuto.
  desc "Refaz a classificação dos cards analisados pelo critério atual — FIELDS=hook,replicability (padrão) ou requires; DRY_RUN=1 só relata; ONLY=id,id"
  task reclassify: :environment do
    dry_run = ENV["DRY_RUN"].present?
    fields = ENV.fetch("FIELDS", "hook,replicability").split(",").map { |field| field.strip.to_sym }
    abort "FIELDS: use #{References::Reclassify::FIELDS.join(', ')}" if (fields - References::Reclassify::FIELDS).any?
    scope = ReferenceCard.where(analysis_status: "done")
    scope = scope.where(id: ENV["ONLY"].split(",")) if ENV["ONLY"].present?
    queue = Queue.new
    scope.order(:created_at).each { |card| queue << card }
    total = queue.size
    results = []
    failures = []
    lock = Mutex.new

    workers = Array.new(4) do
      Thread.new do
        Rails.application.executor.wrap do
          while (card = (queue.pop(true) rescue nil))
            begin
              result = References::Reclassify.new(card, fields: fields).call(dry_run: dry_run)
              lock.synchronize { results << result }
            rescue StandardError => e
              lock.synchronize { failures << "#{card.id} #{card.source['channel']}: #{e.class} #{e.message.to_s.first(120)}" }
            end
          end
        end
      end
    end
    workers.each(&:join)

    # Só o gancho entra no texto do vetor.
    if !dry_run && fields.include?(:hook)
      embed = References::Embed.new
      results.each do |result|
        3.times do
          break if embed.call(result.card).embedding

          sleep 20
        end
        sleep 1
      end
    end

    if ENV["VERBOSE"].present?
      results.sort_by { |r| r.card.source["channel"].to_s }.each do |r|
        changes = fields.map { |field| "#{field} #{r.before[field].inspect} → #{r.after[field].inspect}" }
        puts "#{r.card.source['channel']} #{r.card.id.first(8)} · #{changes.join(' · ')}#{r.fit ? " (#{r.fit})" : ''} · #{r.reason}"
      end
    end
    tally = ->(key, side) { results.map { |r| r.public_send(side)[key] }.tally.sort_by { |code, _| code.to_s }.to_h }
    puts "#{dry_run ? '[DRY_RUN] ' : ''}cards: #{total} · reclassificados: #{results.size} · mudaram: #{results.count(&:changed?)} · custo: US$ #{format('%.2f', results.sum(&:cost_micro_usd) / 1e6)}"
    if fields.include?(:hook)
      puts "gancho antes:  #{tally.(:hook, :before)}"
      puts "gancho depois: #{tally.(:hook, :after)}"
      puts "encaixe forçado do gancho: #{results.count { |r| r.fit == 'forced' }}"
    end
    if fields.include?(:replicability)
      puts "replicabilidade antes:  #{tally.(:replicability, :before)}"
      puts "replicabilidade depois: #{tally.(:replicability, :after)}"
    end
    if fields.include?(:requires)
      needs = results.flat_map { |r| r.after[:requires] }.tally.sort_by { |_, count| -count }.to_h
      puts "o que o post exige: #{needs} · nada além do básico: #{results.count { |r| r.after[:requires].empty? }}"
    end
    puts "sem vetor: #{scope.where(embedding: nil).count}" if !dry_run && fields.include?(:hook)
    failures.each { |line| puts "falhou: #{line}" }
  end

  desc "Apaga os lotes de importação (e os candidatos) com mais de 30 dias — os cards ficam"
  task purge_imports: :environment do
    before = ReferenceImport.count
    References::Imports.purge!
    puts "lotes apagados: #{before - ReferenceImport.count}"
  end
end
