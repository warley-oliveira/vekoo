require "rails_helper"

RSpec.describe Connectors::Alerts do
  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }

  context "com o serviço de avisos" do
    let(:service) { spy("OrganizationAlertService") }

    before { stub_const("OrganizationAlertService", service) }

    it ".disconnected avisa a queda, com o motivo" do
      described_class.disconnected(connector, message: "Sessão expirou")

      expect(service).to have_received(:connector_disconnected).with(organization, connector, message: "Sessão expirou")
    end

    it ".disconnected aceita não ter motivo" do
      described_class.disconnected(connector)

      expect(service).to have_received(:connector_disconnected).with(organization, connector, message: nil)
    end

    it ".reconnected avisa a volta" do
      described_class.reconnected(connector)

      expect(service).to have_received(:connector_reconnected).with(organization, connector)
    end

    it ".error avisa o erro de conta" do
      described_class.error(connector, code: "waba_billing_133010", message: "Cobrança", metadata: { a: 1 })

      expect(service).to have_received(:connector_error).with(organization, connector, code: "waba_billing_133010", message: "Cobrança", metadata: { a: 1 })
    end

    it ".error tem metadados vazios por padrão" do
      described_class.error(connector, code: "x", message: "y")

      expect(service).to have_received(:connector_error).with(organization, connector, code: "x", message: "y", metadata: {})
    end

    it "não avisa sem organização, sem levantar" do
      connector.set(organization_id: SecureRandom.uuid)
      orphan = Connector::Base.find(connector.id)

      expect { described_class.disconnected(orphan) }.not_to raise_error
      expect(service).not_to have_received(:connector_disconnected)
    end

    it "um aviso que falha nunca derruba o webhook ou a ação que o disparou" do
      allow(service).to receive(:connector_disconnected).and_raise(StandardError, "fora do ar")

      expect(described_class.disconnected(connector)).to be_nil
    end

    it "registra no log o aviso que falhou" do
      allow(service).to receive(:connector_error).and_raise(StandardError, "fora do ar")

      log = captured_log { described_class.error(connector, code: "x", message: "y") }

      expect(log).to include("[Connectors::Alerts] StandardError: fora do ar")
    end
  end

  it "não expõe o método interno" do
    expect { described_class.deliver(connector) { nil } }.to raise_error(NoMethodError)
  end
end
