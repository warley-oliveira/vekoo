module Agenda
  # Os horários em que o profissional atende e os bloqueios pontuais dele.
  class Rule
    include Mongoid::Document
    include Mongoid::Timestamps

    DEFAULT_DAYS = [
      { "day_of_week" => 0, "enabled" => false, "windows" => [] },
      { "day_of_week" => 1, "enabled" => true, "windows" => [ { "start" => "09:00", "end" => "17:00" } ] },
      { "day_of_week" => 2, "enabled" => true, "windows" => [ { "start" => "09:00", "end" => "17:00" } ] },
      { "day_of_week" => 3, "enabled" => true, "windows" => [ { "start" => "09:00", "end" => "17:00" } ] },
      { "day_of_week" => 4, "enabled" => true, "windows" => [ { "start" => "09:00", "end" => "17:00" } ] },
      { "day_of_week" => 5, "enabled" => true, "windows" => [ { "start" => "09:00", "end" => "17:00" } ] },
      { "day_of_week" => 6, "enabled" => true, "windows" => [ { "start" => "09:00", "end" => "12:00" } ] }
    ].freeze

    belongs_to :professional, class_name: "Agenda::Professional", inverse_of: :rule

    field :organization_id, type: String
    field :days, type: Array, default: -> { DEFAULT_DAYS.deep_dup }
    # { start, end }: "2026-11-20 14:00", hora de parede no fuso do calendário.
    field :blocked_times, type: Array, default: []

    index({ professional_id: 1 })

    before_validation :normalize_days

    validate :days_are_valid
    validate :blocked_times_are_valid

    before_save { self.organization_id = professional.organization_id if professional }

    # As janelas de um dia da semana. Dia desligado não atende, mesmo que as janelas continuem
    # guardadas: a tela só as esconde ao desligar, e a origem as oferecia assim mesmo.
    def windows_on(day_of_week)
      day = Array(days).find { |item| item["day_of_week"].to_i == day_of_week }
      return [] unless day && day["enabled"]

      Array(day["windows"])
    end

    private

    def normalize_days
      self.days = WeeklySchedule.normalize(days)
    end

    def days_are_valid
      WeeklySchedule.problems(days).each { |problem| errors.add(:days, I18n.t("agenda.validations.#{problem}")) }
    end

    def blocked_times_are_valid
      zone = professional&.calendar&.zone || ActiveSupport::TimeZone[Calendar::DEFAULT_TIME_ZONE]

      Array(blocked_times).each do |blocked|
        start_at = TimeInput.local(blocked["start"], zone)
        end_at = TimeInput.local(blocked["end"], zone)
        next if start_at && end_at && start_at < end_at

        errors.add(:blocked_times, I18n.t("agenda.validations.invalid_blocked_time"))
        break
      end
    end
  end
end
