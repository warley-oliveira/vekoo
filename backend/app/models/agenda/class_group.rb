module Agenda
  # Uma turma: horários que se repetem, com alunos inscritos. As aulas não existem no banco até
  # alguém mexer nelas (`SessionGeneratorService`): só exceções viram `ClassSession`.
  class ClassGroup
    include Mongoid::Document
    include Mongoid::Timestamps

    RECURRENCE_TYPES = %w[weekly biweekly monthly].freeze
    RECURRENCE_END_TYPES = %w[date occurrences never].freeze

    DEFAULT_SCHEDULE = [
      { "day_of_week" => 0, "enabled" => false, "windows" => [] },
      *(1..5).map do |day|
        {
          "day_of_week" => day, "enabled" => true,
          "windows" => [ { "start" => "08:00", "end" => "12:00" }, { "start" => "14:00", "end" => "18:00" } ]
        }
      end,
      { "day_of_week" => 6, "enabled" => false, "windows" => [] }
    ].freeze

    field :organization_id, type: String
    field :name, type: String
    field :description, type: String
    field :external_id, type: String
    field :color, type: String, default: "#8e24aa"
    field :text_color, type: String, default: "#ffffff"
    field :max_students, type: Integer, default: 30
    field :min_students, type: Integer, default: 1
    field :default_duration_minutes, type: Integer, default: 60
    field :start_date, type: Date
    field :end_date, type: Date
    field :schedule, type: Array, default: -> { DEFAULT_SCHEDULE.deep_dup }
    field :location, type: String
    field :room, type: String
    field :address, type: String
    field :instructor_name, type: String
    field :instructor_account_id, type: String
    field :active, type: Boolean, default: true
    field :visible, type: Boolean, default: true
    field :recurrence_type, type: String, default: "weekly"
    field :recurrence_end_type, type: String, default: "date"
    field :recurrence_occurrences, type: Integer
    field :tags, type: Array, default: []
    field :category, type: String
    field :price_cents, type: Integer
    field :price_currency, type: String, default: "BRL"
    field :notes, type: String

    belongs_to :calendar, class_name: "Agenda::Calendar", inverse_of: :class_groups
    has_many :class_enrollments, class_name: "Agenda::ClassEnrollment", inverse_of: :class_group, dependent: :destroy
    has_many :class_sessions, class_name: "Agenda::ClassSession", inverse_of: :class_group, dependent: :destroy

    index({ organization_id: 1, calendar_id: 1 })
    index({ calendar_id: 1, name: 1 })

    before_validation :inherit_from_calendar
    before_validation :normalize_schedule

    validates :organization_id, presence: true
    validates :name, presence: true, length: { maximum: 120 }
    validates :max_students, numericality: { greater_than: 0 }, allow_nil: true
    validates :min_students, numericality: { greater_than_or_equal_to: 0 }, allow_nil: true
    validates :default_duration_minutes, numericality: { greater_than: 0 }, allow_nil: true
    validates :recurrence_type, inclusion: { in: RECURRENCE_TYPES }, allow_nil: true
    validates :recurrence_end_type, inclusion: { in: RECURRENCE_END_TYPES }, allow_nil: true
    validate :end_date_after_start_date
    validate :min_not_greater_than_max
    validate :schedule_is_valid
    validate :instructor_belongs_to_organization

    scope :active, -> { where(active: true) }
    scope :visible, -> { where(visible: true) }

    def self.scoped(organization_id, id)
      where(organization_id: organization_id.to_s, id: id).take
    end

    def zone
      calendar&.zone || ActiveSupport::TimeZone[Calendar::DEFAULT_TIME_ZONE]
    end

    def active_enrollment_count
      class_enrollments.active.count
    end

    # A janela da grade para este dia e hora, ou nil se a grade não tem aula aí.
    def window_at(day_of_week, window_start)
      day = Array(schedule).find { |item| item["day_of_week"].to_i == day_of_week && item["enabled"] }
      return nil unless day

      Array(day["windows"]).find { |window| window["start"] == window_start }
    end

    # O fim da aula que começa neste horário: o fim da janela, ou a duração padrão.
    def session_end_for(start_at)
      local = start_at.in_time_zone(zone)
      finish = window_at(local.wday, local.strftime("%H:%M"))&.dig("end")
      return local + (default_duration_minutes || 60).minutes if finish.blank?

      hours, minutes = finish.split(":").map(&:to_i)
      local.change(hour: hours, min: minutes)
    end

    private

    def inherit_from_calendar
      self.organization_id ||= calendar&.organization_id
    end

    def normalize_schedule
      self.schedule = WeeklySchedule.normalize(schedule)
    end

    def end_date_after_start_date
      return unless start_date.present? && end_date.present? && end_date < start_date

      errors.add(:end_date, I18n.t("agenda.validations.end_date_before_start"))
    end

    def min_not_greater_than_max
      return unless min_students.present? && max_students.present? && min_students > max_students

      errors.add(:min_students, I18n.t("agenda.validations.min_above_max"))
    end

    def schedule_is_valid
      WeeklySchedule.problems(schedule, end_optional: true).each do |problem|
        errors.add(:schedule, I18n.t("agenda.validations.#{problem}"))
      end
    end

    def instructor_belongs_to_organization
      return if instructor_account_id.blank? || !instructor_account_id_changed?
      return if Account.exists?(id: instructor_account_id, organization_id: organization_id)

      errors.add(:instructor_account_id, I18n.t("agenda.validations.unknown_account"))
    end
  end
end
