module Agenda
  # O lembrete ao profissional antes do início. Entrega em dois canais, cada um com seu
  # liga-desliga na regra (ausente vale ligado): sino e push, e WhatsApp.
  #
  # A regra viaja nos argumentos: editar o calendário não muda lembrete já na fila, como na origem.
  class NotificationProfessionalJob < ApplicationJob
    queue_as :default
    sidekiq_options retry: false

    def perform(booking_id, organization_id, rule, token)
      booking = Booking.scoped(organization_id, booking_id)
      return unless booking&.active?
      return unless booking.professional_reminder_token == token
      return if booking.professional_id.blank? || booking.chat_id.blank?

      template = rule["message"].presence || I18n.t("agenda.notices.reminder_default", locale: :"pt-BR")

      ProfessionalNotices.reminder(booking, BookingPlaceholders.render(template, booking)) unless rule["push"] == false
      send_whatsapp(booking, template) unless rule["whatsapp"] == false
    end

    private

    def send_whatsapp(booking, template)
      ProfessionalWhatsappNotifier.new(
        booking, template: template, label: I18n.t("agenda.senders.professional_reminder", locale: :"pt-BR")
      ).call
    end
  end
end
