# Os cenários comuns de alerta, para controladores, jobs e serviços:
#
#   OrganizationAlertService.connector_disconnected(organization, connector)
#   OrganizationAlertService.connector_reconnected(organization, connector)
#   OrganizationAlertService.webhook_error(organization, webhook, "Connection refused")
#   OrganizationAlertService.webhook_resolved(organization, webhook)
#
# Os textos padrão vêm do `code` na leitura (`organization_alerts.messages.*`); `message`
# só é gravado quando quem chama tem um texto próprio.
class OrganizationAlertService
  # ── Conectores ───────────────────────────────────────────────

  def self.connector_disconnected(organization, connector, message: nil)
    OrganizationAlert.raise_alert!(
      organization,
      category: "connectors",
      origin_type: "Connector",
      origin_id: connector.id.to_s,
      origin_name: connector.instance_name,
      code: "connector_disconnected",
      severity: "error",
      message: message,
      metadata: {
        connector_type: connector._type,
        disconnected_at: Time.current.iso8601
      }
    )
  end

  def self.connector_reconnected(organization, connector)
    OrganizationAlert.resolve!(
      organization,
      origin_type: "Connector",
      origin_id: connector.id.to_s,
      code: "connector_disconnected"
    )
  end

  def self.connector_error(organization, connector, code:, message:, metadata: {})
    origin_name = begin
      connector.instance_name
    rescue StandardError
      connector.verified_name
    end
    OrganizationAlert.raise_alert!(
      organization,
      category: "connectors",
      origin_type: "Connector",
      origin_id: connector.id.to_s,
      origin_name: origin_name,
      code: code,
      severity: "error",
      message: message,
      metadata: metadata
    )
  end

  # ── Webhooks ─────────────────────────────────────────────────

  def self.webhook_error(organization, webhook, message = nil)
    OrganizationAlert.raise_alert!(
      organization,
      category: "webhooks",
      origin_type: "Hook",
      origin_id: webhook.id.to_s,
      origin_name: webhook.name,
      code: "webhook_delivery_failed",
      severity: "error",
      message: message,
      metadata: {
        webhook_uid: webhook.uid,
        failed_at: Time.current.iso8601
      }
    )
  end

  def self.webhook_resolved(organization, webhook)
    OrganizationAlert.resolve!(
      organization,
      origin_type: "Hook",
      origin_id: webhook.id.to_s
    )
  end

  # ── Fluxos ───────────────────────────────────────────────────
  # Na origem eram as automações do assistente; aqui quem automatiza é o Fluxo.

  def self.flow_error(organization, flow, code:, message: nil, metadata: {})
    OrganizationAlert.raise_alert!(
      organization,
      category: "flows",
      origin_type: "Flow",
      origin_id: flow.id.to_s,
      origin_name: flow.name,
      code: code,
      severity: "error",
      message: message,
      metadata: metadata
    )
  end

  def self.flow_resolved(organization, flow, code: nil)
    OrganizationAlert.resolve!(
      organization,
      origin_type: "Flow",
      origin_id: flow.id.to_s,
      code: code
    )
  end

  # ── Genéricos ────────────────────────────────────────────────

  def self.raise_alert(organization, category:, origin_type:, origin_id:, code:, **opts)
    OrganizationAlert.raise_alert!(
      organization,
      category: category,
      origin_type: origin_type,
      origin_id: origin_id,
      code: code,
      **opts
    )
  end

  def self.resolve_alert(organization, origin_type:, origin_id:, code: nil)
    OrganizationAlert.resolve!(
      organization,
      origin_type: origin_type,
      origin_id: origin_id,
      code: code
    )
  end
end
