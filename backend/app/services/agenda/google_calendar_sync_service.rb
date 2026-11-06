module Agenda
  # Traz para a agenda o que mudou no Google, sempre em job. O aviso do Google é só um "mudou
  # algo", sem dados, então é preciso listar:
  #
  #   * sem token: lê a janela de FULL_SYNC_WINDOW e guarda o `nextSyncToken`;
  #   * com token: lê só o que mudou desde a última vez;
  #   * token vencido (410): limpa e lê a janela inteira.
  #
  # Evento apagado no Google cancela o agendamento. Evento novo vira agendamento, com o profissional
  # que tiver o e-mail de um dos convidados. O que entra por aqui não volta para o Google.
  class GoogleCalendarSyncService
    FULL_SYNC_WINDOW = 30.days

    def initialize(connector)
      @connector = connector
    end

    def call
      if connector.sync_token.present?
        sync(sync_token: connector.sync_token)
      else
        sync(time_min: FULL_SYNC_WINDOW.ago)
      end
    rescue Google::Apis::ClientError => e
      raise unless e.status_code == 410

      Rails.logger.info("[Agenda::GoogleCalendarSync] token vencido em #{connector.id}: lendo a janela inteira")
      connector.update(sync_token: nil)
      sync(time_min: FULL_SYNC_WINDOW.ago)
    end

    private

    attr_reader :connector

    def client
      @client ||= connector.client
    end

    def calendar
      return @calendar if defined?(@calendar)

      @calendar = Calendar.where(organization_id: connector.organization_id, google_calendar_connector_id: connector.id.to_s).take
    end

    def sync(sync_token: nil, time_min: nil)
      return unless calendar

      page_token = nil
      next_sync = nil

      loop do
        page = client.sync_events(sync_token: sync_token, time_min: time_min, page_token: page_token)
        break if page.nil?

        Array(page.items).each { |event| upsert_event(event) }

        next_sync = page.next_sync_token if page.next_sync_token.present?
        page_token = page.next_page_token
        break if page_token.blank?
      end

      connector.update(sync_token: next_sync) if next_sync.present?
    end

    def upsert_event(event)
      return cancel_event(event) if event.status == "cancelled"

      start_at = time_of(event.start)
      end_at = time_of(event.end)
      return if start_at.nil? || end_at.nil?

      booking = find_booking(event)
      return create_booking(event, start_at, end_at) unless booking

      attributes = { start: start_at, end: end_at, description: event.description.to_s, title: event.summary }
      color = color_for(event)
      attributes[:color] = color if color
      # Sincronização parcial sem o link não pode apagar o que já foi gravado.
      attributes[:google_meet_url] = event.hangout_link if event.hangout_link.present?

      booking.skip_google_push = true
      booking.update(attributes)
    end

    def find_booking(event)
      Booking.where(connector_id: connector.id, google_event_id: event.id).take
    end

    # Espelho do Google: grava sem avisar o profissional, porque os avisos são para o que foi
    # marcado por aqui.
    def create_booking(event, start_at, end_at)
      Booking.create(
        calendar: calendar,
        connector_id: connector.id,
        google_event_id: event.id,
        start: start_at,
        end: end_at,
        description: event.description.to_s,
        title: event.summary,
        professional_id: professional_id_for(event),
        color: color_for(event),
        google_meet_url: event.hangout_link,
        skip_professional_notifications: true,
        skip_google_push: true
      )
    end

    def cancel_event(event)
      booking = find_booking(event)
      return unless booking&.active?

      booking.skip_google_push = true
      booking.update(status: "canceled")
    end

    # Evento de dia inteiro não tem hora: vale do começo do dia, no fuso do calendário. A origem
    # gravava esse agendamento sem início nem fim.
    def time_of(value)
      return nil if value.nil?
      return value.date_time.in_time_zone(calendar.zone) if value.date_time.present?
      return nil if value.date.blank?

      calendar.zone.parse(value.date.to_s)
    end

    def professional_id_for(event)
      emails = Array(event.attendees).filter_map { |attendee| attendee.email&.downcase }
      return nil if emails.empty?

      calendar.professionals.find { |professional| emails.include?(professional.email&.downcase) }&.id
    end

    def color_for(event)
      return nil unless event.color_id

      event_colors[event.color_id]&.background
    end

    # Uma vez por sincronização, em vez de uma por evento.
    def event_colors
      @event_colors ||= connector.event_colors
    rescue StandardError => e
      Rails.logger.warn("[Agenda::GoogleCalendarSync] cores: #{e.class}: #{e.message}")
      @event_colors = {}
    end
  end
end
