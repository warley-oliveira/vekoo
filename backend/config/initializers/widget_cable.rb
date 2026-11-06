# Segundo servidor ActionCable, em /widget-cable, para o widget do site: autentica o
# visitante anônimo pelo JWT assinado com o segredo do conector (o /cable principal usa
# a sessão de quem entrou na plataforma). A montagem fica em config/routes/connectors.rb.
module WidgetCable
  def self.server
    @server ||= begin
      cfg = ActionCable::Server::Configuration.new
      cfg.connection_class = -> { WidgetCable::Connection }
      cfg.cable = Rails.application.config_for(:cable).deep_stringify_keys
      cfg.logger = Rails.logger
      cfg.allow_same_origin_as_host = true
      cfg.disable_request_forgery_protection = true
      # O widget roda em domínios dos clientes: a origem é validada por conector em
      # WidgetCable::Connection#connect, não aqui.
      cfg.allowed_request_origins = [ /.*/ ]
      ActionCable::Server::Base.new(config: cfg)
    end
  end
end
