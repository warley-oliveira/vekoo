module Agenda
  # A exceção de uma aula: cancelada, com observação, ou com presença marcada. A aula comum não
  # tem documento (ver `SessionGeneratorService`).
  class ClassSession
    include Mongoid::Document
    include Mongoid::Timestamps

    field :organization_id, type: String
    field :start, type: Time
    field :end, type: Time
    field :status, type: String, default: "active"
    field :title, type: String
    field :notes, type: String
    field :color, type: String

    belongs_to :class_group, class_name: "Agenda::ClassGroup", inverse_of: :class_sessions
    belongs_to :calendar, class_name: "Agenda::Calendar", inverse_of: :class_sessions, optional: true
    has_many :class_attendances, class_name: "Agenda::ClassAttendance", inverse_of: :class_session, dependent: :destroy

    index({ class_group_id: 1, start: 1 })
    index({ organization_id: 1, start: 1 })

    before_validation :inherit_from_class_group

    validates :organization_id, presence: true
    validates :start, :end, presence: true
    validates :status, inclusion: { in: %w[active canceled] }
    validate :ends_after_start

    after_create { broadcast(:create) }
    after_update { broadcast(canceled? ? :destroy : :update) }
    after_destroy { broadcast(:destroy) }

    scope :active, -> { where(status: "active") }

    def self.scoped(organization_id, id)
      where(organization_id: organization_id.to_s, id: id).take
    end

    def canceled? = status == "canceled"

    def title
      super.presence || class_group&.name
    end

    def color
      super.presence || class_group&.color || ClassGroup.fields["color"].default_val
    end

    def text_color
      class_group&.text_color || ClassGroup.fields["text_color"].default_val
    end

    def zone
      class_group&.zone || ActiveSupport::TimeZone[Calendar::DEFAULT_TIME_ZONE]
    end

    def local_start
      start&.in_time_zone(zone)
    end

    def schedule_slot
      local = local_start
      { day_of_week: local.wday, window_start: local.strftime("%H:%M") }
    end

    def enrollment_count
      return 0 unless class_group && start

      class_group.class_enrollments.active.for_slot(schedule_slot).enrolled_by(local_start).count +
        class_attendances.where(guest: true).count
    end

    def max_students
      class_group&.max_students || 0
    end

    def attendance_summary
      counts = class_attendances.pluck(:attendance_status).tally
      total = counts.values.sum
      show = counts["show"].to_i
      no_show = counts["no_show"].to_i
      { total: total, show: show, noShow: no_show, pending: total - show - no_show }
    end

    private

    def inherit_from_class_group
      return unless class_group

      self.calendar_id ||= class_group.calendar_id
      self.organization_id ||= class_group.organization_id
    end

    def ends_after_start
      return if start.blank? || self.end.blank? || self.end >= start

      errors.add(:end, I18n.t("agenda.validations.end_before_start"))
    end

    def broadcast(action)
      AgendaChannel.broadcast_event(
        organization_id,
        { action: action, type: "class_session", event: ClassSessionSerializer.one(self) }
      )
    end
  end
end
