module Agenda
  # A exceção de uma aula, no mesmo formato da aula calculada por `SessionGeneratorService`.
  class ClassSessionSerializer < ApplicationSerializer
    def self.one(session)
      class_group = session.class_group
      slot = session.schedule_slot

      {
        id: session.id.to_s,
        type: "class_session",
        virtual: false,
        start: epoch_ms(session.start),
        end: epoch_ms(session.end),
        status: session.status,
        title: session.title,
        notes: session.notes,
        classGroupId: session.class_group_id&.to_s,
        classGroupName: class_group&.name,
        calendarId: session.calendar_id&.to_s,
        color: session.color,
        textColor: session.text_color,
        instructorName: class_group&.instructor_name,
        room: class_group&.room,
        location: class_group&.location,
        enrollmentCount: session.enrollment_count,
        maxStudents: session.max_students,
        attendanceSummary: session.attendance_summary,
        scheduleDayOfWeek: slot[:day_of_week],
        scheduleWindowStart: slot[:window_start],
        createdAt: epoch_ms(session.created_at),
        updatedAt: epoch_ms(session.updated_at)
      }
    end
  end
end
