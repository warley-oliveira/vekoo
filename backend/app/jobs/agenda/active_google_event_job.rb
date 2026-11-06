module Agenda
  # Renova o canal de avisos de uma conta Google. Idempotente: cria um canal novo e guarda o estado.
  class ActiveGoogleEventJob < ApplicationJob
    queue_as :default

    retry_on Google::Apis::ServerError, Google::Apis::RateLimitError, Google::Apis::TransmissionError,
             wait: :polynomially_longer, attempts: 3 do |job, error|
      Rails.logger.error("[Agenda::ActiveGoogleEventJob] #{job.arguments.first}: #{error.class}: #{error.message}")
    end
    discard_on GoogleClient::Revoked, GoogleClient::NotConfigured, Google::Apis::ClientError do |job, error|
      Rails.logger.warn("[Agenda::ActiveGoogleEventJob] #{job.arguments.first}: #{error.class}: #{error.message}")
    end

    def perform(connector_id, organization_id)
      connector = Connector::GoogleCalendar.where(organization_id: organization_id.to_s, id: connector_id).take
      return unless connector&.active?

      connector.ensure_app_calendar!
      connector.watch!
    end
  end
end
