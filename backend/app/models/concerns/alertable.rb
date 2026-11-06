# typed: false

# Concern that provides a convenient DSL for raising and resolving
# OrganizationAlerts from any model or service.
#
# Usage in a model:
#   include Alertable
#
#   # Raise an alert
#   raise_organization_alert!(
#     organization: my_core_account,
#     category:     'connectors',
#     origin_type:  'Connector',
#     origin_id:    connector.id,
#     origin_name:  connector.name,
#     code:         'connector_disconnected',
#     message:      'WhatsApp connection lost'
#   )
#
#   # Resolve when the issue is fixed
#   resolve_organization_alert!(
#     organization: my_core_account,
#     origin_type:  'Connector',
#     origin_id:    connector.id,
#     code:         'connector_disconnected'
#   )
#
module Alertable
  extend ActiveSupport::Concern

  def raise_organization_alert!(organization:, category:, origin_type:, origin_id:, code:, severity: 'error',
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
