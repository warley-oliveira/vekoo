# Associações de `Chat` com o domínio "agenda". Ficam aqui, e não em Chat, para cada
# domínio evoluir sem disputar o mesmo arquivo.
module ChatRelations
  module Agenda
    extend ActiveSupport::Concern

    included do
      has_many :bookings, class_name: "Agenda::Booking", inverse_of: :chat, dependent: :destroy
      has_many :class_enrollments, class_name: "Agenda::ClassEnrollment", inverse_of: :chat, dependent: :destroy
      has_many :class_attendances, class_name: "Agenda::ClassAttendance", inverse_of: :chat, dependent: :destroy
      has_many :scheduled_actions, class_name: "ScheduledAction", inverse_of: :chat, dependent: :destroy

      # O painel do chat mostra se a automação está ligada e quando volta. Ela muda por vários
      # caminhos (pessoa, fluxo, `EnableContactJob`), e este é o ponto comum a todos.
      after_update :broadcast_scheduled_work_on_automation_change
    end

    # Os agendamentos que ainda não acabaram, no formato que os fluxos entregam aos scripts.
    def future_bookings_json
      bookings.where(:end.gt => Time.current).where(status: "active").order_by(start: :asc).map do |booking|
        local_start = booking.local_start

        {
          booking_id: booking.id.to_s,
          start: local_start.strftime("%Y-%m-%d %H:%M"),
          end: booking.end.in_time_zone(local_start.time_zone).strftime("%Y-%m-%d %H:%M"),
          service_name: booking.service_name,
          employee_name: booking.employee_name
        }
      end
    end

    private

    def broadcast_scheduled_work_on_automation_change
      return if ignore_events
      return unless (previous_changes.keys & %w[automation_enabled automation_resume_at]).any?

      ScheduledAction.broadcast_for(self)
    end
  end
end
