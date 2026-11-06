module Agenda
  # Entrega no WhatsApp do profissional o aviso de um evento do agendamento. Em job porque o envio é
  # HTTP externo e não pode segurar a resposta da API.
  #
  # Sem nova tentativa, como os irmãos: a falha já está visível no chat, e repetir um aviso minutos
  # depois vale menos do que não duplicá-lo.
  class ProfessionalWhatsappJob < ApplicationJob
    queue_as :default
    sidekiq_options retry: false

    LABELS = {
      "created" => "professional_created",
      "canceled" => "professional_canceled",
      "rescheduled" => "professional_rescheduled"
    }.freeze

    def perform(booking_id, organization_id, event)
      booking = Booking.scoped(organization_id, booking_id)
      return unless booking

      # Cancelamento é o único evento que faz sentido avisar num agendamento cancelado.
      return if booking.canceled? && event != "canceled"

      rule = booking.calendar.professional_event_rule(event)
      return unless rule["whatsapp"]

      ProfessionalWhatsappNotifier.new(
        booking,
        template: rule["message"],
        label: I18n.t("agenda.senders.#{LABELS.fetch(event, 'calendar')}", locale: :"pt-BR")
      ).call
    end
  end
end
