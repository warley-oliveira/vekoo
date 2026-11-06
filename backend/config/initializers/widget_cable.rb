# Segundo servidor ActionCable, em /widget-cable, para o widget do site: autentica o
# visitante anônimo pelo JWT assinado com o segredo do conector (o /cable principal usa
# a sessão de quem entrou na plataforma). A montagem fica em config/routes/connectors.rb.
module WidgetCable
  def self.server
    @server ||= begin
      cfg = ActionCable::Server::Configuration.new
      cfg.connection_class = -> { WidgetCable::Connection }
      # Como o engine faz no servidor principal. `config_for` devolve OrderedOptions, que guarda
      # as chaves como símbolo, e o `fetch("adapter")` do ActionCable cairia sempre no redis.
      cfg.cable = Rails.application.config_for(:cable).to_h.with_indifferent_access
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
