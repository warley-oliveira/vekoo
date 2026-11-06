module Agenda
  # Tira um evento do Google, depois que o agendamento foi cancelado ou apagado. Recebe o id do
  # evento porque o agendamento já não o tem (ou nem existe mais).
  class GoogleDeleteJob < ApplicationJob
    queue_as :default

    retry_on Google::Apis::ServerError, Google::Apis::RateLimitError, Google::Apis::TransmissionError,
             wait: :polynomially_longer, attempts: 5 do |job, error|
      Rails.logger.error("[Agenda::GoogleDeleteJob] #{job.arguments.last}: #{error.class}: #{error.message}")
    end
    discard_on GoogleClient::Revoked, GoogleClient::NotConfigured, Google::Apis::ClientError do |job, error|
      Rails.logger.warn("[Agenda::GoogleDeleteJob] #{job.arguments.last}: #{error.class}: #{error.message}")
    end

    def perform(connector_id, organization_id, event_id)
      connector = Connector::GoogleCalendar.where(organization_id: organization_id.to_s, id: connector_id).take
      return unless connector&.active?

      connector.client.delete_event(event_id)
    end
  end
end
