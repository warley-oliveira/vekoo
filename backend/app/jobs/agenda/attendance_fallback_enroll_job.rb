module Agenda
  # "X minutos depois do fim do evento": quem não marcou comparecimento nem inscreveu à mão, o
  # sistema conclui que a pessoa faltou, marca, e inscreve na sequência de falta.
  class AttendanceFallbackEnrollJob < ApplicationJob
    queue_as :default

    def perform(booking_id, organization_id, sequence_id, token)
      booking = Booking.scoped(organization_id, booking_id)
      return unless booking
      return unless booking.fallback_enroll_token == token

      # A origem marcava falta também em agendamento cancelado.
      return unless booking.active?
      return if booking.attendance_status.present?
      return if booking.enrolled_sequence_id.present?

      # Sem isto, marcar a falta aqui dispararia também a inscrição de "ao marcar comparecimento".
      booking.skip_attendance_auto_enroll = true
      booking.update(attendance_status: "no_show")

      result = EnrollAttendanceSequenceService.new(booking, sequence_id, auto: true).call
      Rails.logger.info("[Agenda::AttendanceFallbackEnrollJob] #{booking_id}: #{result.success? ? 'inscrito' : result.code}")
    end
  end
end
