module Agenda
  # A semana de horários que o profissional atende (`Rule#days`) e que a turma acontece
  # (`ClassGroup#schedule`): o mesmo formato, com a mesma regra.
  #
  #   [{ "day_of_week" => 1, "enabled" => true, "windows" => [{ "start" => "09:00", "end" => "17:00" }] }]
  #
  # Horário é hora de parede no fuso do calendário. Janela não cruza a meia-noite: o aviso, a
  # conta de vagas e o id da aula virtual dependem de cada janela pertencer a um dia só.
  module WeeklySchedule
    TIME_FORMAT = /\A([01]\d|2[0-3]):[0-5]\d\z/

    module_function

    def normalize(days)
      Array(days).filter_map do |day|
        next unless day.respond_to?(:to_h)

        day = day.to_h.stringify_keys
        {
          "day_of_week" => day["day_of_week"].to_i,
          "enabled" => ActiveModel::Type::Boolean.new.cast(day["enabled"]) || false,
          "windows" => Array(day["windows"]).filter_map { |window| normalize_window(window) }
        }
      end
    end

    # Os problemas de uma semana já normalizada, como chaves de `agenda.validations`.
    #
    # @param end_optional [Boolean] turma pode não ter fim de janela: aí vale a duração padrão
    def problems(days, end_optional: false)
      seen = []

      days.each_with_object([]) do |day, found|
        found << :invalid_day unless (0..6).cover?(day["day_of_week"])
        found << :duplicate_day if seen.include?(day["day_of_week"])
        seen << day["day_of_week"]
        next unless day["enabled"]

        found.concat(window_problems(day["windows"], end_optional))
      end.uniq
    end

    def minutes(value)
      hours, mins = value.to_s.split(":").map(&:to_i)
      (hours * 60) + mins.to_i
    end

    def normalize_window(window)
      return unless window.respond_to?(:to_h)

      window = window.to_h.stringify_keys
      { "start" => window["start"].to_s.strip, "end" => window["end"].to_s.strip.presence }.compact
    end

    def window_problems(windows, end_optional)
      return [ :no_windows ] if windows.empty?

      found = []
      windows.each do |window|
        finish = window["end"]
        found << :invalid_time unless window["start"].to_s.match?(TIME_FORMAT)
        next found << :invalid_time if finish.nil? && !end_optional
        next if finish.nil?

        found << :invalid_time unless finish.match?(TIME_FORMAT)
        found << :start_after_end if minutes(window["start"]) >= minutes(finish)
      end
      found << :overlap if found.empty? && overlapping?(windows)
      found
    end

    def overlapping?(windows)
      ranges = windows.map { |w| [ minutes(w["start"]), w["end"] ? minutes(w["end"]) : minutes(w["start"]) + 1 ] }.sort
      ranges.each_cons(2).any? { |(_, previous_end), (next_start, _)| next_start < previous_end }
    end
  end
end
