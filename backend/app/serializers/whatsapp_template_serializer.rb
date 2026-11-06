class WhatsappTemplateSerializer < ApplicationSerializer
  def self.one(template)
    {
      id: template.id.to_s,
      connectorId: template.connector_id&.to_s,
      templateId: template.template_id,
      name: template.name,
      language: template.language,
      category: template.category,
      subCategory: template.sub_category,
      previousCategory: template.previous_category,
      correctCategory: template.correct_category,
      rejectedReason: template.rejected_reason,
      qualityScore: template.quality_score,
      parameterFormat: template.parameter_format,
      messageSendTtlSeconds: template.message_send_ttl_seconds,
      status: template.status_cd,
      removed: template.removed?,
      removedAt: epoch_ms(template.removed_at),
      lastSyncedAt: epoch_ms(template.last_synced_at),
      # Payload da Meta: as chaves de `components` são dados do provedor e saem como estão.
      components: template.components,
      headerFormat: template.header_format,
      headerMediaUrl: template.header_media_url,
      headerAttachmentId: template.header_attachment_id,
      hasMediaHeader: template.has_media_header?,
      hasLocationHeader: template.has_location_header?,
      hasParameters: template.has_parameters?,
      buttons: template.buttons,
      createdAt: epoch_ms(template.created_at),
      updatedAt: epoch_ms(template.updated_at)
    }
  end
end
