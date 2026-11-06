module Agenda
  class ClassAttendanceSerializer < ApplicationSerializer
    def self.one(attendance, chat = attendance.chat)
      {
        id: attendance.id.to_s,
        classSessionId: attendance.class_session_id&.to_s,
        classEnrollmentId: attendance.class_enrollment_id&.to_s,
        chatId: attendance.chat_id&.to_s,
        attendanceStatus: attendance.attendance_status,
        checkedAt: epoch_ms(attendance.checked_at),
        checkedBy: attendance.checked_by,
        guest: attendance.guest?,
        userName: chat&.user_name,
        profilePictureUrl: chat&.profile_picture_url,
        contactExternalId: chat&.external_id
      }
    end

    # Inscrito que ainda não tem registro de presença: fica pendente até alguém marcar, com um id
    # que diz de qual inscrição se trata.
    def self.pending(enrollment, chat = enrollment.chat)
      {
        id: "#{SessionSlot::PENDING_PREFIX}#{enrollment.id}",
        classSessionId: nil,
        classEnrollmentId: enrollment.id.to_s,
        chatId: enrollment.chat_id&.to_s,
        attendanceStatus: nil,
        checkedAt: nil,
        checkedBy: nil,
        guest: false,
        userName: chat&.user_name,
        profilePictureUrl: chat&.profile_picture_url,
        contactExternalId: chat&.external_id
      }
    end
  end
end
