module Agenda
  class ClassEnrollmentSerializer < ApplicationSerializer
    def self.many(enrollments)
      records = enrollments.to_a
      chats = ContactLookup.for(records)

      records.map { |enrollment| one(enrollment, chats[enrollment.chat_id]) }
    end

    def self.one(enrollment, chat = enrollment.chat)
      {
        id: enrollment.id.to_s,
        classGroupId: enrollment.class_group_id&.to_s,
        chatId: enrollment.chat_id&.to_s,
        status: enrollment.status,
        enrolledAt: epoch_ms(enrollment.enrolled_at),
        scheduleDayOfWeek: enrollment.schedule_day_of_week,
        scheduleWindowStart: enrollment.schedule_window_start,
        externalId: enrollment.external_id,
        notes: enrollment.notes,
        userName: chat&.user_name,
        profilePictureUrl: chat&.profile_picture_url,
        contactExternalId: chat&.external_id
      }
    end
  end
end
