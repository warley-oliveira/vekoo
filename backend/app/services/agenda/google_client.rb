require "google/apis/calendar_v3"
require "signet/oauth_2/client"

module Agenda
  # O Google Agenda de uma conta conectada. É o único lugar que conhece a API do Google.
  #
  # Sem as credenciais em ENV (`GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`,
  # `GOOGLE_CALENDAR_REDIRECT_URI`), `configured?` é falso, a API responde `googleNotConfigured` ao
  # conectar, e todo o resto do calendário segue funcionando.
  #
  # O token de acesso é renovado só quando vence (a origem renovava antes de toda chamada). Um
  # `refresh_token` revogado marca o conector como `failed` e avisa a organização: tentar de novo
  # daria o mesmo erro até alguém reconectar.
  class GoogleClient
    class NotConfigured < StandardError; end
    class Revoked < StandardError; end

    AUTHORIZATION_URI = "https://accounts.google.com/o/oauth2/auth".freeze
    TOKEN_URI = "https://oauth2.googleapis.com/token".freeze
    # `calendar.app.created` alcança só o calendário criado por este app. `openid email` é para
    # mostrar na tela qual conta está ligada.
    SCOPES = %w[https://www.googleapis.com/auth/calendar.app.created openid email].freeze
    # O máximo que o Google aceita para um canal de avisos.
    WATCH_TTL_SECONDS = "604800".freeze
    TOKEN_REFRESH_MARGIN = 60.seconds
    AUTH_ATTEMPTS = 2

    Watch = Struct.new(:id, :resource_id, :expires_at, keyword_init: true)

    class << self
      def configured?
        client_id.present? && client_secret.present? && redirect_uri.present?
      end

      def authorization_url(state:)
        oauth_client.authorization_uri(state: state, hl: "pt-BR", prompt: "consent").to_s
      end

      # @return [Hash] os tokens: access_token, refresh_token, expires_in, id_token
      # @raise [Signet::AuthorizationError] código inválido ou expirado
      def exchange_code(code)
        client = oauth_client
        client.code = code
        client.fetch_access_token!
      end

      # O `id_token` veio direto do Google, por TLS, na troca do código: dá para ler sem conferir a
      # assinatura, e ele só serve para mostrar a conta na tela.
      def email_from(tokens)
        payload = tokens.to_h.stringify_keys["id_token"].to_s.split(".")[1]
        return nil if payload.blank?

        JSON.parse(Base64.urlsafe_decode64(payload.ljust((payload.size + 3) / 4 * 4, "=")))["email"].presence
      rescue ArgumentError, JSON::ParserError
        nil
      end

      def oauth_client
        raise NotConfigured unless configured?

        Signet::OAuth2::Client.new(
          authorization_uri: AUTHORIZATION_URI,
          token_credential_uri: TOKEN_URI,
          client_id: client_id,
          client_secret: client_secret,
          scope: SCOPES,
          access_type: :offline,
          redirect_uri: redirect_uri
        )
      end

      private

      def client_id = ENV["GOOGLE_CALENDAR_CLIENT_ID"].presence
      def client_secret = ENV["GOOGLE_CALENDAR_CLIENT_SECRET"].presence
      def redirect_uri = ENV["GOOGLE_CALENDAR_REDIRECT_URI"].presence
    end

    def initialize(connector)
      @connector = connector
    end

    def create_calendar(summary, description)
      request do |service|
        service.insert_calendar(Google::Apis::CalendarV3::Calendar.new(summary: summary, description: description))
      end
    end

    def create_event(summary:, description:, start_at:, end_at:, attendees:, time_zone:)
      event = Google::Apis::CalendarV3::Event.new(
        summary: summary,
        description: description,
        start: event_time(start_at, time_zone),
        end: event_time(end_at, time_zone),
        attendees: attendees.map { |email| Google::Apis::CalendarV3::EventAttendee.new(email: email) },
        conference_data: Google::Apis::CalendarV3::ConferenceData.new(
          create_request: Google::Apis::CalendarV3::CreateConferenceRequest.new(
            request_id: SecureRandom.uuid,
            conference_solution_key: Google::Apis::CalendarV3::ConferenceSolutionKey.new(type: "hangoutsMeet")
          )
        )
      )

      request do |service|
        service.insert_event(calendar_id, event, send_updates: "all", conference_data_version: 1)
      end
    end

    def get_event(event_id)
      request { |service| service.get_event(calendar_id, event_id) }
    end

    def update_event(event_id, summary:, description:, start_at:, end_at:, time_zone:)
      event = get_event(event_id)
      return nil unless event

      event.summary = summary
      event.description = description
      event.start = event_time(start_at, time_zone)
      event.end = event_time(end_at, time_zone)

      request { |service| service.update_event(calendar_id, event_id, event) }
    end

    def delete_event(event_id)
      request { |service| service.delete_event(calendar_id, event_id) }
    rescue Google::Apis::ClientError => e
      # 410 e 404: já não existe, que é o que se queria.
      raise unless [ 404, 410 ].include?(e.status_code)
    end

    # @return [Watch]
    def watch(address:, channel_token:)
      channel = Google::Apis::CalendarV3::Channel.new(
        id: SecureRandom.uuid,
        type: "web_hook",
        address: address,
        token: channel_token,
        params: { "ttl" => WATCH_TTL_SECONDS }
      )

      response = request { |service| service.watch_event(calendar_id, channel) }
      Watch.new(id: response.id, resource_id: response.resource_id, expires_at: Time.zone.at(response.expiration.to_i / 1000))
    end

    # Uma página de eventos para sincronizar. Com `sync_token`, só o que mudou (e nada de outros
    # filtros: o token lembra os parâmetros da primeira leitura). Com `time_min`, a janela inteira.
    #
    # @raise [Google::Apis::ClientError] 410 quando o token venceu: quem chama refaz a leitura inteira
    def sync_events(sync_token: nil, time_min: nil, page_token: nil)
      options =
        if sync_token.present?
          { sync_token: sync_token, page_token: page_token }
        else
          { time_min: time_min&.utc&.iso8601, single_events: true, show_deleted: true, page_token: page_token }
        end

      request { |service| service.list_events(calendar_id, **options.compact) }
    end

    def colors
      request(&:get_color)
    end

    private

    attr_reader :connector

    def calendar_id
      connector.google_calendar_id
    end

    def event_time(time, zone_name)
      Google::Apis::CalendarV3::EventDateTime.new(date_time: time.to_datetime, time_zone: zone_name)
    end

    def request
      attempts = 0

      begin
        yield(service)
      rescue Google::Apis::AuthorizationError
        attempts += 1
        raise if attempts >= AUTH_ATTEMPTS

        refresh!
        retry
      end
    end

    def service
      fresh_token!

      Google::Apis::CalendarV3::CalendarService.new.tap do |calendar|
        calendar.authorization = authorization
        calendar.client_options.application_name = "Vekoo"
        calendar.client_options.open_timeout_sec = 5
        calendar.client_options.read_timeout_sec = 20
        calendar.request_options.retries = 3
      end
    end

    def authorization
      self.class.oauth_client.tap do |client|
        client.update!(refresh_token: connector.refresh_token, access_token: connector.access_token)
      end
    end

    def fresh_token!
      return if connector.access_token.present? && connector.token_expires_at && connector.token_expires_at > TOKEN_REFRESH_MARGIN.from_now

      refresh!
    end

    def refresh!
      raise Revoked, "sem refresh_token" if connector.refresh_token.blank?

      tokens = authorization.refresh!
      connector.update!(
        access_token: tokens["access_token"],
        token_expires_at: Time.current + tokens["expires_in"].to_i.seconds
      )
    rescue Signet::AuthorizationError => e
      connector.update!(status: :failed, error_message: I18n.t("agenda.google.revoked", locale: :"pt-BR"))
      Connectors::Alerts.error(connector, code: "google_calendar_revoked", message: I18n.t("agenda.google.revoked", locale: :"pt-BR"))
      raise Revoked, e.message
    end
  end
end
