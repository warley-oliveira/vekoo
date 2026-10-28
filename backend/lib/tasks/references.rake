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

  desc "Apaga os lotes de importação (e os candidatos) com mais de 30 dias — os cards ficam"
  task purge_imports: :environment do
    before = ReferenceImport.count
    References::Imports.purge!
    puts "lotes apagados: #{before - ReferenceImport.count}"
  end
end
