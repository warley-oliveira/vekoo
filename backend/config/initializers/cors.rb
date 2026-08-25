# Origens explícitas, nunca curinga. `origins '*'` com Bearer token "funciona",
# mas deixa qualquer site dirigir a API pelo navegador de quem estiver logado.
#
# Produção: FRONTEND_ORIGINS vem do deploy.yml (https://my.vekoo.app).
# Desenvolvimento: o Vite em localhost:VITE_PORT.
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allowed = ENV.fetch("FRONTEND_ORIGINS") {
    ENV.fetch("FRONTEND_ORIGIN", "http://localhost:#{ENV.fetch('VITE_PORT', 5173)}")
  }.split(",").map(&:strip).reject(&:empty?)

  allow do
    origins(*allowed)

    resource "*",
      headers: :any,
      methods: %i[get post put patch delete options head],
      expose: %w[],
      credentials: false
  end
end
