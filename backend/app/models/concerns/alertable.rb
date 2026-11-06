# Atalho para levantar e resolver OrganizationAlerts de qualquer modelo ou serviço.
#
#   include Alertable
#
#   raise_organization_alert!(
#     organization: organization,
#     category:     'connectors',
#     origin_type:  'Connector',
#     origin_id:    connector.id,
#     origin_name:  connector.name,
#     code:         'connector_disconnected',
#     message:      'WhatsApp connection lost'
#   )
#
#   resolve_organization_alert!(
#     organization: organization,
#     origin_type:  'Connector',
#     origin_id:    connector.id,
#     code:         'connector_disconnected'
#   )
module Alertable
  extend ActiveSupport::Concern

  def raise_organization_alert!(organization:, category:, origin_type:, origin_id:, code:, severity: "error",
                                message: nil, origin_name: nil, metadata: {})
    OrganizationAlert.raise_alert!(
      organization,
      category: category,
      origin_type: origin_type,
      origin_id: origin_id,
      code: code,
      severity: severity,
      message: message,
      origin_name: origin_name,
      metadata: metadata
    )
  end

  def resolve_organization_alert!(organization:, origin_type:, origin_id:, code: nil)
    OrganizationAlert.resolve!(
      organization,
      origin_type: origin_type,
      origin_id: origin_id,
      code: code
    )
  end
end
