module Agenda
  # Espelha um agendamento no Google. Em job porque a API não pode depender do Google estar de pé: o
  # agendamento vale do mesmo jeito, e o link do Meet chega depois, pelo tempo real.
  #
  # Idempotente: sem id do Google, cria; com id, atualiza com o estado atual.
  class GooglePushJob < ApplicationJob
    queue_as :default

    # Criar e logo depois alterar enfileira dois jobs, e os dois criariam o evento.
    LOCK_TTL = 30.seconds

    retry_on Google::Apis::ServerError, Google::Apis::RateLimitError, Google::Apis::TransmissionError,
             wait: :polynomially_longer, attempts: 5 do |job, error|
      Rails.logger.error("[Agenda::GooglePushJob] #{job.arguments.first}: #{error.class}: #{error.message}")
    end
    discard_on GoogleClient::Revoked, GoogleClient::NotConfigured do |job, error|
      Rails.logger.warn("[Agenda::GooglePushJob] #{job.arguments.first}: #{error.class}: #{error.message}")
    end

    def perform(booking_id, organization_id)
      booking = Booking.scoped(organization_id, booking_id)
      return unless booking&.active?

      connector = booking.calendar.google_calendar_connector
      return unless connector&.active?

      with_lock(booking) { push(booking, connector) }
    end

    private

    def with_lock(booking)
      key = "agenda.google_push.#{booking.id}"
      unless Rails.cache.write(key, true, unless_exist: true, expires_in: LOCK_TTL)
        return self.class.set(wait: LOCK_TTL).perform_later(*arguments)
      end

      begin
        yield
      ensure
        Rails.cache.delete(key)
      end
    end

    def push(booking, connector)
      if booking.google_event_id.present?
        connector.client.update_event(booking.google_event_id, **event_fields(booking))
      else
        create(booking, connector)
      end
    rescue Google::Apis::ClientError => e
      # Erro do pedido (evento apagado à mão, calendário removido): tentar de novo não muda nada.
      Rails.logger.warn("[Agenda::GooglePushJob] #{booking.id}: #{e.status_code}: #{e.message}")
    end

    def create(booking, connector)
      event = connector.client.create_event(
        **event_fields(booking),
        attendees: [ booking.professional&.user_email ].compact
      )

      # `set`, sem callbacks: gravar o id não é uma mudança que deva voltar para o Google.
      booking.set(google_event_id: event.id, google_meet_url: event.hangout_link, connector_id: connector.id)
      AgendaChannel.broadcast_booking(booking, :update)
    end

    def event_fields(booking)
      {
        summary: booking.title,
        description: booking.description,
        start_at: booking.start,
        end_at: booking.end,
        time_zone: booking.zone.tzinfo.name
      }
    end
  end
end
