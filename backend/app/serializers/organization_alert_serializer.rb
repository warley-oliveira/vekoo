class OrganizationAlertSerializer < ApplicationSerializer
  def self.one(alert)
    {
      id: alert.id,
      category: alert.category,
      severity: alert.severity,
      originType: alert.origin_type,
      originId: alert.origin_id,
      originName: alert.origin_name,
      code: alert.code,
      message: alert.display_message,
      metadata: alert.metadata,
      createdAt: epoch_ms(alert.created_at),
      updatedAt: epoch_ms(alert.updated_at)
    }
  end
end
