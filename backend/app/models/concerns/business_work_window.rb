# Janela de atendimento da automação. Na origem as colunas `business_work`,
# `business_work_enabled` e `timezone` (offset inteiro) moravam no assistente; aqui é
# configuração da organização, em `settings`, no fuso que ela já tem (`timezone`, nome IANA).
#
# Formato normalizado de `settings["business_work"]`:
#
#   { 'days' => [{ 'day_of_week' => '1', 'enabled' => 'true',
#                  'windows' => [{ 'start' => '09:00', 'end' => '17:30' }] }] }
#
# Janelas são do mesmo dia (não cruzam a meia-noite), com início e fim inclusivos.
module BusinessWorkWindow
  extend ActiveSupport::Concern

  TIME_FORMAT = /\A([01]?\d|2[0-3]):([0-5]\d)\z/
  DEFAULT_TIMEZONE = "America/Sao_Paulo".freeze

  included do
    before_validation :normalize_business_work, if: :business_work_settings_changing?
    validate :validate_business_work, if: :business_work_settings_changing?
  end

  def business_work
    settings.to_h["business_work"] || {}
  end

  def business_work_enabled
    ActiveModel::Type::Boolean.new.cast(settings.to_h["business_work_enabled"]) || false
  end

  def inside_business_window?
    return true unless business_work_enabled

    now = business_time_now
    day = enabled_business_days.find { |d| d["day_of_week"].to_i == now.wday }
    return false unless day

    Array(day["windows"]).any? do |window|
      start_at = business_window_time(now.to_date, window["start"])
      end_at = business_window_time(now.to_date, window["end"])
      start_at && end_at && now >= start_at && now <= end_at
    end
  end

  # Próxima abertura de janela a partir de agora (até 7 dias à frente), ou nil
  # se não houver nenhum dia habilitado.
  def next_business_window
    return nil unless business_work_enabled

    now = business_time_now
    8.times do |offset|
      date = now.to_date + offset
      day = enabled_business_days.find { |d| d["day_of_week"].to_i == date.wday }
      next unless day

      opening = Array(day["windows"])
                .filter_map { |window| business_window_time(date, window["start"]) }
                .select { |time| time > now }
                .min
      return opening if opening
    end

    nil
  end

  private

  def business_zone
    ActiveSupport::TimeZone[timezone.presence || DEFAULT_TIMEZONE] || ActiveSupport::TimeZone[DEFAULT_TIMEZONE]
  end

  def business_time_now
    Time.current.in_time_zone(business_zone)
  end

  def business_days
    work = business_work.is_a?(Hash) ? business_work.with_indifferent_access : {}
    Array(work[:days]).select { |day| day.is_a?(Hash) }
  end

  def enabled_business_days
    business_days.select { |day| day["enabled"].to_s == "true" }
  end

  def business_window_time(date, value)
    minutes = business_minutes(value)
    return unless minutes

    business_zone.local(date.year, date.month, date.day, minutes / 60, minutes % 60)
  end

  def business_minutes(value)
    match = TIME_FORMAT.match(value.to_s.strip)
    match && ((match[1].to_i * 60) + match[2].to_i)
  end

  def normalize_business_work
    return unless settings.to_h.key?("business_work")

    settings["business_work"] = Normalizer.call(settings["business_work"])
  end

  def business_work_settings_changing?
    return false unless settings_changed?

    previous = settings_was.to_h
    current = settings.to_h
    %w[business_work business_work_enabled].any? { |key| previous[key] != current[key] }
  end

  def validate_business_work
    enabled_days = enabled_business_days
    errors.add(:settings, I18n.t("connectors.business_work.no_days")) if business_work_enabled && enabled_days.empty?

    enabled_days.each { |day| validate_business_day(day) }
  end

  def validate_business_day(day)
    prefix = I18n.t("connectors.business_work.day_prefix", day: I18n.t("connectors.business_work.days")[day["day_of_week"].to_i])
    ranges = Array(day["windows"]).map { |w| [ business_minutes(w["start"]), business_minutes(w["end"]) ] }

    problem =
      if ranges.empty?
        :no_ranges
      elsif ranges.flatten.any?(&:nil?)
        :invalid_time
      elsif ranges.any? { |start, finish| start >= finish }
        :start_after_end
      elsif business_ranges_overlap?(ranges)
        :overlap
      end

    errors.add(:settings, "#{prefix}: #{I18n.t("connectors.business_work.#{problem}")}") if problem
  end

  def business_ranges_overlap?(ranges)
    ranges.sort.each_cons(2).any? { |(_, previous_end), (next_start, _)| next_start < previous_end }
  end
end
