require "rails_helper"

RSpec.describe Alertable do
  let(:organization) { create(:organization) }
  let(:host) { Class.new { include Alertable }.new }

  it "levanta um alerta com tudo que foi pedido" do
    alert = host.raise_organization_alert!(
      organization: organization,
      category: "connectors",
      origin_type: "Connector",
      origin_id: "abc",
      origin_name: "WhatsApp da loja",
      code: "connector_disconnected",
      severity: "warning",
      message: "Sessão caiu",
      metadata: { motivo: "logout" }
    )

    expect(alert).to have_attributes(
      organization: organization, category: "connectors", origin_type: "Connector", origin_id: "abc",
      origin_name: "WhatsApp da loja", code: "connector_disconnected", severity: "warning", message: "Sessão caiu"
    )
    expect(alert.metadata).to eq("motivo" => "logout")
  end

  it "resolve o alerta" do
    host.raise_organization_alert!(
      organization: organization, category: "connectors", origin_type: "Connector", origin_id: "abc", code: "connector_disconnected"
    )

    count = host.resolve_organization_alert!(
      organization: organization, origin_type: "Connector", origin_id: "abc", code: "connector_disconnected"
    )

    expect(count).to eq(1)
    expect(OrganizationAlert.active.count).to eq(0)
  end

  it "sem código, resolve tudo da origem" do
    %w[a b].each do |code|
      host.raise_organization_alert!(
        organization: organization, category: "connectors", origin_type: "Connector", origin_id: "abc", code: code
      )
    end

    expect(host.resolve_organization_alert!(organization: organization, origin_type: "Connector", origin_id: "abc")).to eq(2)
  end
end
