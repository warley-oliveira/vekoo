# Origens explícitas, nunca curinga. `origins '*'` com Bearer token "funciona",
# mas deixa qualquer site dirigir a API pelo navegador de quem estiver logado.
#
# Produção: FRONTEND_ORIGINS vem do deploy.yml (https://my.vekoo.app).
# Desenvolvimento: o Vite em localhost:VITE_PORT.
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allowed = ENV.fetch("FRONTEND_ORIGINS") {
    ENV.fetch("FRONTEND_ORIGIN", "http://localhost:#{ENV.fetch('VITE_PORT', 5173)}")
  }.split(",").map(&:strip).reject(&:empty?)

  # O WebSocket não passa pelo CORS; a mesma lista protege o /cable.
  Rails.application.config.action_cable.allowed_request_origins = allowed

  allow do
    origins(*allowed)

    resource "*",
      headers: :any,
      methods: %i[get post put patch delete options head],
      # O nome do arquivo no download de mídia pela API.
      expose: %w[Content-Disposition],
      credentials: false
  end

  # O widget de chat roda em sites dos clientes: qualquer origem passa aqui, e a origem é
  # validada por conector em Widget::BaseController e WidgetCable::Connection.
  allow do
    origins "*"

    resource "/widget/v1/*",
      headers: :any,
      methods: %i[get post put options head],
      credentials: false
  end
end
