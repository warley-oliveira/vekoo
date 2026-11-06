# Tempo real do calendário: agendamentos e aulas criados, alterados e removidos, presença e
# inscrição. A stream é da organização inteira, e a tela filtra pelo intervalo que está vendo.
class AgendaChannel < ApplicationCable::Channel
  STREAM = "agenda"

  # Melhor esforço: um soluço no Redis não pode impedir a gravação do agendamento. Quem perdeu o
  # aviso relê na próxima abertura da tela.
  def self.broadcast_event(organization_id, payload)
    ActionCable.server.broadcast(organization_stream(organization_id, STREAM), payload)
  rescue StandardError => e
    Rails.logger.warn("[AgendaChannel] transmissão perdida: #{e.class}: #{e.message}")
  end

  def self.broadcast_booking(booking, action)
    broadcast_event(
      booking.organization_id,
      { action: action, type: "booking", event: Agenda::BookingSerializer.one(booking) }
    )
  end

  def subscribed
    # Mesma regra da API: sem o recurso `calendar`, os eventos também não chegam.
    return reject unless current_account.can?(:calendar)

    stream_from organization_stream(STREAM)
  end

  def unsubscribed
    stop_all_streams
  end

  def unsubscribe
    stop_all_streams
  end
end
