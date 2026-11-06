module Agenda
  # Liga um calendário a uma conta Google. A tela manda a pessoa para `authorizationUrl`, o Google
  # devolve para `GOOGLE_CALENDAR_REDIRECT_URI` com `code` e `state`, e a tela entrega os dois em
  # `callback`. O id do calendário é o começo do `state` (ver `GoogleOauthState`).
  class GoogleCalendarController < BaseController
    before_action :set_calendar

    def connect
      return render_not_configured unless GoogleClient.configured?

      connector = @calendar.google_calendar_connector ||
                  Connector::GoogleCalendar.create!(organization_id: current_organization.id, status: :pending)
      @calendar.update!(google_calendar_connector_id: connector.id.to_s)

      render json: {
        authorizationUrl: GoogleClient.authorization_url(state: GoogleOauthState.generate(@calendar, current_account)),
        connectorId: connector.id.to_s
      }
    end

    def callback
      return render_not_configured unless GoogleClient.configured?

      unless GoogleOauthState.valid?(params[:state], @calendar, current_account)
        return render_error(status: :unprocessable_entity, code: "invalidState", field: "state", message: t("agenda.google.invalid_state"))
      end

      connector = @calendar.google_calendar_connector
      return render_error(status: :unprocessable_entity, code: "googleNotStarted", message: t("agenda.google.not_started")) unless connector

      finish_connection(connector, params.require(:code))
      render json: { calendar: CalendarSerializer.one(@calendar) }
    rescue Signet::AuthorizationError => e
      Rails.logger.warn("[Agenda::GoogleCalendarController] autorização recusada: #{e.message}")
      render_error(status: :unprocessable_entity, code: "googleAuthorizationFailed", message: t("agenda.google.authorization_failed"))
    rescue Google::Apis::Error, GoogleClient::Revoked => e
      Rails.logger.error("[Agenda::GoogleCalendarController] #{e.class}: #{e.message}")
      render_error(status: :unprocessable_entity, code: "googleConnectionFailed", message: t("agenda.google.connection_failed"))
    end

    def disconnect
      connector = @calendar.google_calendar_connector
      return render_not_found unless connector

      connector.deactivate
      @calendar.update!(google_calendar_connector_id: nil)

      render json: { calendar: CalendarSerializer.one(@calendar) }
    end

    private

    def render_not_configured
      render_error(status: :unprocessable_entity, code: "googleNotConfigured", message: t("agenda.google.not_configured"))
    end

    # O canal de avisos é o último passo, e a falha dele não desfaz a conexão: em um endereço que o
    # Google não aceita (desenvolvimento, por exemplo) o espelho de ida funciona do mesmo jeito, e a
    # renovação diária tenta abrir o canal de novo.
    def finish_connection(connector, code)
      connector.store_authorization!(GoogleClient.exchange_code(code))
      connector.ensure_app_calendar!

      begin
        connector.watch!
      rescue Google::Apis::Error => e
        Rails.logger.warn("[Agenda::GoogleCalendarController] canal de avisos: #{e.class}: #{e.message}")
      end

      GoogleCalendarSyncJob.perform_later(connector.id.to_s, connector.organization_id)
    end
  end
end
