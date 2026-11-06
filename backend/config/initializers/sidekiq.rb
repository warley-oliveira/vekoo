# Nas specs o ActiveJob fica no adaptador `:test` (ver environments/test.rb):
# `have_enqueued_job` só funciona com ele, e nenhuma spec fala com o Redis.
Rails.application.config.active_job.queue_adapter = :sidekiq unless Rails.env.test?

redis_url = ENV.fetch("REDIS_URL", "redis://localhost:6379/0")

Sidekiq.configure_server do |config|
  config.redis = { url: redis_url }

  # Cada domínio declara os próprios jobs recorrentes em config/schedule/<dominio>.yml,
  # em vez de todos disputarem o mesmo arquivo.
  config.on(:startup) do
    # O processo de scripts não agenda nada: os recorrentes ficam no processo principal.
    next if config.queues == [ "scripts" ]

    schedule = Rails.root.glob("config/schedule/*.yml").sort.each_with_object({}) do |file, merged|
      merged.merge!(YAML.load_file(file) || {})
    end

    Sidekiq.schedule = schedule
    SidekiqScheduler::Scheduler.instance.reload_schedule!
  end
end

Sidekiq.configure_client do |config|
  config.redis = { url: redis_url }
end
