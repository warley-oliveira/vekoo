module Agenda
  # `startDate` e `endDate` saem como "AAAA-MM-DD", sem virar milissegundos: são dias do calendário,
  # e não instantes. Em milissegundos, o dia mudaria conforme o fuso de quem lê.
  class ClassGroupSerializer < ApplicationSerializer
    def self.many(class_groups)
      records = class_groups.to_a
      counts = enrollment_counts(records)

      records.map { |class_group| one(class_group, active_enrollment_count: counts[class_group.id].to_i) }
    end

    def self.one(class_group, active_enrollment_count: class_group.active_enrollment_count)
      {
        id: class_group.id.to_s,
        calendarId: class_group.calendar_id&.to_s,
        name: class_group.name,
        description: class_group.description,
        externalId: class_group.external_id,
        color: class_group.color,
        textColor: class_group.text_color,
        maxStudents: class_group.max_students,
        minStudents: class_group.min_students,
        defaultDurationMinutes: class_group.default_duration_minutes,
        startDate: class_group.start_date&.iso8601,
        endDate: class_group.end_date&.iso8601,
        schedule: ProfessionalSerializer.days_json(class_group.schedule),
        location: class_group.location,
        room: class_group.room,
        address: class_group.address,
        instructorName: class_group.instructor_name,
        instructorAccountId: class_group.instructor_account_id,
        active: class_group.active,
        visible: class_group.visible,
        recurrenceType: class_group.recurrence_type,
        recurrenceEndType: class_group.recurrence_end_type,
        recurrenceOccurrences: class_group.recurrence_occurrences,
        tags: class_group.tags,
        category: class_group.category,
        priceCents: class_group.price_cents,
        priceCurrency: class_group.price_currency,
        notes: class_group.notes,
        activeEnrollmentCount: active_enrollment_count,
        createdAt: epoch_ms(class_group.created_at),
        updatedAt: epoch_ms(class_group.updated_at)
      }
    end

    def self.enrollment_counts(class_groups)
      return {} if class_groups.empty?

      ClassEnrollment.collection.aggregate([
        { "$match" => { "class_group_id" => { "$in" => class_groups.map(&:id) }, "status" => "active" } },
        { "$group" => { "_id" => "$class_group_id", "count" => { "$sum" => 1 } } }
      ]).to_h { |row| [ row["_id"], row["count"] ] }
    end
    private_class_method :enrollment_counts
  end
end
