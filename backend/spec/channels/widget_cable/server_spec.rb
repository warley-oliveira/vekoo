require "rails_helper"

# O segundo servidor ActionCable, o do widget nos sites dos clientes.
RSpec.describe WidgetCable do
  subject(:config) { described_class.server.config }

  it "autentica pela conexão do widget, e não pela sessão da plataforma" do
    expect(config.connection_class.call).to eq(WidgetCable::Connection)
  end

  it "aceita qualquer origem aqui: quem filtra é o conector, na conexão" do
    expect(config.allowed_request_origins).to contain_exactly(/.*/)
    expect(config.disable_request_forgery_protection).to be(true)
  end

  # Quem transmite é `ActionCable.server` (o controlador, o conector). O visitante só recebe
  # se os dois servidores falarem com o mesmo pub/sub.
  it "usa o mesmo pub/sub do servidor principal" do
    expect(config.cable).to eq(ActionCable.server.config.cable)
    expect(config.pubsub_adapter).to eq(ActionCable.server.config.pubsub_adapter)
  end

  it "está montado em /widget-cable" do
    route = Rails.application.routes.routes.find { |candidate| candidate.path.spec.to_s.start_with?("/widget-cable") }

    expect(route).to be_present
    expect(route.app.app).to eq(described_class.server)
  end
end
