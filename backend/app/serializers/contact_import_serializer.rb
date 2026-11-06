class ContactImportSerializer < ApplicationSerializer
  def self.one(contact_import)
    {
      id: contact_import.id,
      connectorId: contact_import.connector_id,
      accountId: contact_import.account_id,
      fileName: contact_import.file_name,
      status: contact_import.status,
      totalContacts: contact_import.total_contacts,
      importedContactsCount: contact_import.imported_contacts_count,
      errorsCount: contact_import.errors_count,
      includeCountryCode: contact_import.include_country_code,
      batchIndex: contact_import.batch_index,
      totalBatches: contact_import.total_batches,
      successRate: contact_import.success_rate,
      progressPercentage: contact_import.progress_percentage,
      processingDuration: contact_import.processing_duration,
      startedAt: epoch_ms(contact_import.started_at),
      completedAt: epoch_ms(contact_import.completed_at),
      createdAt: epoch_ms(contact_import.created_at)
    }
  end
end
