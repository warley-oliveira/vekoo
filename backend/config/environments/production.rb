require "active_support/core_ext/integer/time"

Rails.application.configure do
  # Settings specified here will take precedence over those in config/application.rb.

  # Code is not reloaded between requests.
  config.enable_reloading = false

  # Eager load code on boot for better performance and memory savings (ignored by Rake tasks).
  config.eager_load = true

  # Full error reports are disabled.
  config.consider_all_requests_local = false

  # Cache assets for far-future expiry since they are all digest stamped.
  config.public_file_server.headers = { "cache-control" => "public, max-age=#{1.year.to_i}" }

  # Enable serving of images, stylesheets, and JavaScripts from an asset server.
  # config.asset_host = "http://assets.example.com"

  # Store uploaded files on the local file system (see config/storage.yml for options).
  config.active_storage.service = :local

  # Assume all access to the app is happening through a SSL-terminating reverse proxy.
  config.assume_ssl = true

  # Force all access to the app over SSL, use Strict-Transport-Security, and use secure cookies.
  config.force_ssl = true

  # Skip http-to-https redirect for the default health check endpoint.
  # config.ssl_options = { redirect: { exclude: ->(request) { request.path == "/up" } } }

  # Log to STDOUT with the current request id as a default log tag.
  config.log_tags = [ :request_id ]
  config.logger   = ActiveSupport::TaggedLogging.logger(STDOUT)

  # Change to "debug" to log everything (including potentially personally-identifiable information!).
  config.log_level = ENV.fetch("RAILS_LOG_LEVEL", "info")

  # Prevent health checks from clogging up the logs.
  config.silence_healthcheck_path = "/up"

  # Don't log any deprecations.
  config.active_support.report_deprecations = false

  # Redis, e não memory_store, porque o cache passou a guardar coisa que precisa
  # ser **compartilhada**: a trava de "uma geração por organização" existe para
  # proteger as threads do Puma, e com WEB_CONCURRENCY: 2 uma trava por processo
  # protegeria metade do servidor. Banco 2 — 0 é a fila do Sidekiq, 1 é o
  # ActionCable.
  config.cache_store = :redis_cache_store, {
    url: ENV.fetch("CACHE_REDIS_URL") { ENV.fetch("REDIS_URL", "redis://localhost:6379/2") },
    # Cache fora do ar não pode derrubar a API: sem Redis a trava simplesmente
    # não trava, e é melhor assim do que um 500 em toda geração.
    error_handler: ->(method:, returning:, exception:) {
      Rails.logger.error("cache #{method}: #{exception.class}")
    }
  }

  # Replace the default in-process and non-durable queuing backend for Active Job.
  # config.active_job.queue_adapter = :resque

  # Ignore bad email addresses and do not raise email delivery errors.
  # Set this to true and configure the email server for immediate delivery to raise delivery errors.
  # config.action_mailer.raise_delivery_errors = false

  # Set host to be used by links generated in mailer templates.
  config.action_mailer.default_url_options = {
    host: URI.parse(ENV.fetch("BACKEND_URL", "https://syco.vekoo.app")).host,
    protocol: "https"
  }

  # Specify outgoing SMTP server. Remember to add smtp/* credentials via bin/rails credentials:edit.
  # config.action_mailer.smtp_settings = {
  #   user_name: Rails.application.credentials.dig(:smtp, :user_name),
  #   password: Rails.application.credentials.dig(:smtp, :password),
  #   address: "smtp.example.com",
  #   port: 587,
  #   authentication: :plain
  # }

  # Enable locale fallbacks for I18n (makes lookups for any locale fall back to
  # the I18n.default_locale when a translation cannot be found).
  config.i18n.fallbacks = true

  # Do not dump schema after migrations.
  config.active_record.dump_schema_after_migration = false

  # Only use :id for inspections in production.
  config.active_record.attributes_for_inspect = [ :id ]

  # A API fica atrás da Cloudflare, e o Rails só confia em proxy de rede privada. Sem as faixas dela,
  # `remote_ip` é o IP da borda: todo mundo que cai na mesma borda divide o mesmo limite de login, de
  # cadastro e de conexão do widget. É seguro porque o firewall só aceita 80/443 destas faixas (ver
  # bin/deploy-setup), e o que a pessoa escreve em X-Forwarded-For fica à esquerda do que a Cloudflare
  # acrescenta. Lista de https://www.cloudflare.com/ips/. Faixa nova que falte aqui só devolve quem vier
  # por ela ao comportamento antigo.
  config.action_dispatch.trusted_proxies = ActionDispatch::RemoteIp::TRUSTED_PROXIES + %w[
    173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18
    190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13
    104.24.0.0/14 172.64.0.0/13 131.0.72.0/22
    2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32
  ].map { |range| IPAddr.new(range) }

  # Proteção contra DNS rebinding / Host header. APP_HOSTS vem do deploy.yml.
  config.hosts = ENV.fetch("APP_HOSTS", "").split(",").map(&:strip).reject(&:empty?)

  # O kamal-proxy sonda o healthcheck pelo IP do container, não pelo domínio.
  # Sem esta exclusão o /up toma 403, o Kamal considera o deploy insalubre e
  # faz rollback — em todo deploy, para sempre.
  config.host_authorization = { exclude: ->(request) { request.path == "/up" } }

  # URLs absolutas de anexo (Active Storage) fora do ciclo de request.
  Rails.application.routes.default_url_options = {
    host: URI.parse(ENV.fetch("BACKEND_URL", "https://syco.vekoo.app")).host,
    protocol: "https"
  }
end
