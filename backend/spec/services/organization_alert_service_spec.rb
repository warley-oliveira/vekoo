require "rails_helper"

# Conectores, webhooks e fluxos ainda não existem neste worktree: o serviço só precisa do
# que eles respondem, então um dublê com os mesmos métodos basta.
RSpec.describe OrganizationAlertService do
  let(:organization) { create(:organization) }
  let(:connector) { Struct.new(:id, :instance_name, :_type).new("conector-1", "WhatsApp da loja", "Connector::WhatsappWeb") }
  let(:hook) { Struct.new(:id, :name, :uid).new("hook-1", "CRM externo", "uid-1") }
  let(:flow) { Struct.new(:id, :name).new("fluxo-1", "Boas-vindas") }

  describe ".connector_disconnected / .connector_reconnected" do
    it "levanta o alerta de conector desconectado, com a frase vinda do código" do
      alert = described_class.connector_disconnected(organization, connector)

      expect(alert).to have_attributes(
        category: "connectors", origin_type: "Connector", origin_id: "conector-1",
        origin_name: "WhatsApp da loja", code: "connector_disconnected", severity: "error", message: nil
      )
      expect(alert.metadata).to include("connector_type" => "Connector::WhatsappWeb", "disconnected_at" => be_present)
      expect(alert.display_message).to eq("A integração \"WhatsApp da loja\" foi desconectada.")
    end

    it "aceita um texto próprio" do
      alert = described_class.connector_disconnected(organization, connector, message: "Celular sem bateria")

      expect(alert.display_message).to eq("Celular sem bateria")
    end

    it "resolve ao reconectar, sem tocar nos outros alertas do conector" do
      described_class.connector_disconnected(organization, connector)
      other = described_class.connector_error(organization, connector, code: "low_quality", message: "Qualidade baixa")

      expect(described_class.connector_reconnected(organization, connector)).to eq(1)
      expect(organization.organization_alerts.active).to contain_exactly(other)
    end
  end

  describe ".connector_error" do
    it "levanta o alerta com o código e o texto de quem chamou" do
      alert = described_class.connector_error(
        organization, connector, code: "template_rejected", message: "Template rejeitado", metadata: { template: "ola" }
      )

      expect(alert).to have_attributes(code: "template_rejected", message: "Template rejeitado", origin_name: "WhatsApp da loja")
      expect(alert.metadata).to eq("template" => "ola")
    end

    # Conector de WhatsApp Cloud não tem `instance_name`: o nome vem de `verified_name`.
    it "cai em verified_name quando o conector não tem instance_name" do
      waba = Class.new do
        def id = "waba-1"
        def verified_name = "Loja Verificada"
        def instance_name = raise(NoMethodError)
      end.new

      alert = described_class.connector_error(organization, waba, code: "x", message: "y")

      expect(alert.origin_name).to eq("Loja Verificada")
    end
  end

  describe ".webhook_error / .webhook_resolved" do
    it "levanta o alerta de entrega e resolve tudo do webhook" do
      alert = described_class.webhook_error(organization, hook)

      expect(alert).to have_attributes(
        category: "webhooks", origin_type: "Hook", origin_id: "hook-1", origin_name: "CRM externo", code: "webhook_delivery_failed"
      )
      expect(alert.metadata).to include("webhook_uid" => "uid-1")
      expect(alert.display_message).to eq("Falha na entrega do webhook \"CRM externo\".")

      expect(described_class.webhook_resolved(organization, hook)).to eq(1)
    end

    it "aceita um texto próprio" do
      expect(described_class.webhook_error(organization, hook, "Connection refused").display_message).to eq("Connection refused")
    end
  end

  describe ".flow_error / .flow_resolved" do
    it "levanta e resolve o alerta do fluxo" do
      alert = described_class.flow_error(organization, flow, code: "flow_failed", message: "Bloco inválido")

      expect(alert).to have_attributes(
        category: "flows", origin_type: "Flow", origin_id: "fluxo-1", origin_name: "Boas-vindas", code: "flow_failed"
      )
      expect(described_class.flow_resolved(organization, flow, code: "flow_failed")).to eq(1)
    end
  end

  describe ".raise_alert / .resolve_alert" do
    it "levantam e resolvem qualquer alerta" do
      alert = described_class.raise_alert(
        organization, category: "catalog", origin_type: "Import", origin_id: "1", code: "import_failed", severity: "warning"
      )

      expect(alert.severity).to eq("warning")
      expect(described_class.resolve_alert(organization, origin_type: "Import", origin_id: "1")).to eq(1)
    end
  end

  # O atalho que a origem tinha na própria conta.
  describe "atalhos em Organization" do
    it "levantam, contam e resolvem" do
      organization.raise_alert(category: "connectors", origin_type: "Connector", origin_id: "1", code: "x")
      organization.raise_alert(category: "webhooks", origin_type: "Hook", origin_id: "2", code: "y")

      expect(organization.active_alert_badges).to eq("connectors" => 1, "webhooks" => 1)

      organization.resolve_alert(origin_type: "Connector", origin_id: "1")
      expect(organization.active_alert_badges).to eq("webhooks" => 1)

      organization.resolve_alerts_for_category("webhooks")
      expect(organization.active_alert_badges).to eq({})
    end
  end
end
