require "rails_helper"

# `OrganizationAlert` é do domínio access: aqui só importa o que o concern pede a ele.
RSpec.describe Alertable do
  subject(:host) { Class.new { include Alertable }.new }

  let(:organization) { build(:organization) }
  let(:alerts) { spy("OrganizationAlert") }

  before { stub_const("OrganizationAlert", alerts) }

  describe "#raise_organization_alert!" do
    it "repassa tudo ao modelo de avisos" do
      host.raise_organization_alert!(
        organization: organization, category: "connectors", origin_type: "Connector", origin_id: "C1", code: "connector_disconnected",
        severity: "warning", message: "Caiu", origin_name: "Loja da Ana", metadata: { a: 1 }
      )

      expect(alerts).to have_received(:raise_alert!).with(
        organization,
        category: "connectors", origin_type: "Connector", origin_id: "C1", code: "connector_disconnected",
        severity: "warning", message: "Caiu", origin_name: "Loja da Ana", metadata: { a: 1 }
      )
    end

    it "é erro por padrão, sem mensagem nem metadados" do
      host.raise_organization_alert!(organization: organization, category: "connectors", origin_type: "Connector", origin_id: "C1", code: "x")

      expect(alerts).to have_received(:raise_alert!).with(organization, hash_including(severity: "error", message: nil, origin_name: nil, metadata: {}))
    end

    it "devolve o aviso" do
      allow(alerts).to receive(:raise_alert!).and_return(:aviso)

      expect(host.raise_organization_alert!(organization: organization, category: "c", origin_type: "t", origin_id: "i", code: "x")).to eq(:aviso)
    end
  end

  describe "#resolve_organization_alert!" do
    it "resolve pelo código" do
      host.resolve_organization_alert!(organization: organization, origin_type: "Connector", origin_id: "C1", code: "connector_disconnected")

      expect(alerts).to have_received(:resolve!).with(organization, origin_type: "Connector", origin_id: "C1", code: "connector_disconnected")
    end

    it "resolve tudo da origem sem código" do
      host.resolve_organization_alert!(organization: organization, origin_type: "Connector", origin_id: "C1")

      expect(alerts).to have_received(:resolve!).with(organization, origin_type: "Connector", origin_id: "C1", code: nil)
    end
  end
end
