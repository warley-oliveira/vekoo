module Agenda
  # Mudou a grade da turma: as aulas futuras que já têm documento e as inscrições vão junto. As
  # aulas passadas ficam como estão, porque são histórico.
  #
  # A correspondência entre a grade antiga e a nova é por posição dentro de cada dia. Janela que
  # sumiu não tem para onde ir, e a aula fica onde estava.
  class ClassGroupRescheduler
    def initialize(class_group, old_schedule)
      @class_group = class_group
      @old_schedule = old_schedule
      @zone = class_group.zone
    end

    def call
      mapping = window_mapping
      return if mapping.empty?

      move_future_sessions(mapping)
      move_enrollments(mapping)
    end

    private

    def move_future_sessions(mapping)
      @class_group.class_sessions.where(:start.gt => Time.current).each do |session|
        local = session.slot_start.in_time_zone(@zone)
        window = mapping.dig(local.wday, local.strftime("%H:%M"))
        next unless window

        new_start = at(local, window["start"])
        new_end = window["end"].present? ? at(local, window["end"]) : new_start + (@class_group.default_duration_minutes || 60).minutes

        # A aula movida à mão fica onde a pessoa pôs: muda só o horário da grade que ela ocupa.
        session.update(session.moved? ? { slot_start: new_start } : { slot_start: new_start, start: new_start, end: new_end })
      end
    end

    def move_enrollments(mapping)
      mapping.each do |day_of_week, windows|
        windows.each do |old_start, window|
          next if old_start == window["start"]

          @class_group.class_enrollments
                      .where(schedule_day_of_week: day_of_week, schedule_window_start: old_start)
                      .update_all(schedule_window_start: window["start"])
        end
      end
    end

    def at(local, hhmm)
      hours, minutes = hhmm.split(":").map(&:to_i)
      local.change(hour: hours, min: minutes)
    end

    # { dia da semana => { "HH:MM antigo" => { "start" => ..., "end" => ... } } }, só do que mudou.
    def window_mapping
      Array(@old_schedule).each_with_object({}) do |old_day, mapping|
        day_of_week = old_day["day_of_week"].to_i
        new_day = Array(@class_group.schedule).find { |day| day["day_of_week"].to_i == day_of_week }

        changes = changed_windows(old_day, new_day)
        mapping[day_of_week] = changes unless changes.empty?
      end
    end

    def changed_windows(old_day, new_day)
      old_windows = old_day["enabled"] ? Array(old_day["windows"]) : []
      new_windows = new_day && new_day["enabled"] ? Array(new_day["windows"]) : []

      old_windows.each_with_index.each_with_object({}) do |(old_window, index), changes|
        new_window = new_windows[index]
        next unless new_window
        next if old_window["start"] == new_window["start"] && old_window["end"] == new_window["end"]

        changes[old_window["start"]] = new_window
      end
    end
  end
end
