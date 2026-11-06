module Agenda
  # Enfileirado a cada aviso do Google pelo webhook, para não segurar a requisição.
  class GoogleCalendarSyncJob < ApplicationJob
    queue_as :default

    retry_on Google::Apis::ServerError, Google::Apis::RateLimitError, Google::Apis::TransmissionError,
             wait: :polynomially_longer, attempts: 5 do |job, error|
      Rails.logger.error("[Agenda::GoogleCalendarSyncJob] #{job.arguments.first}: #{error.class}: #{error.message}")
    end
    discard_on GoogleClient::Revoked, GoogleClient::NotConfigured do |job, error|
      Rails.logger.warn("[Agenda::GoogleCalendarSyncJob] #{job.arguments.first}: #{error.class}: #{error.message}")
    end

    def perform(connector_id, organization_id)
      connector = Connector::GoogleCalendar.where(organization_id: organization_id.to_s, id: connector_id).take
      return unless connector&.active?

      GoogleCalendarSyncService.new(connector).call
    end
  end
end
