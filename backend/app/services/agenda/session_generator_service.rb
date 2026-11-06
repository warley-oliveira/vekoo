module Agenda
  # As aulas de uma turma em um período, calculadas da grade, sem gravar nada. Só as exceções
  # (cancelada, com observação, com presença, movida, avulsa) têm documento: entram na lista, e o
  # horário da grade que ocupam deixa de ser calculado.
  #
  #   Agenda::SessionGeneratorService.new(class_group, from_date, to_date).call
  #
  # Id da aula calculada: vcs_<id da turma>_<AAAAMMDD>_<HHMM>, com data e hora de parede no fuso do
  # calendário. O formato é contrato: a tela o usa para identificar a aula, e qualquer ação nela
  # materializa o documento.
  class SessionGeneratorService
    VIRTUAL_ID_PREFIX = "vcs".freeze
    VIRTUAL_ID_FORMAT = /\Avcs_([a-zA-Z0-9]+)_(\d{8})_(\d{4})\z/

    def self.virtual_id?(id)
      id.to_s.start_with?("#{VIRTUAL_ID_PREFIX}_")
    end

    # @return [Hash, nil] { class_group_id:, date:, time: "HH:MM" }
    def self.parse_virtual_id(virtual_id)
      match = VIRTUAL_ID_FORMAT.match(virtual_id.to_s)
      return nil unless match

      {
        class_group_id: match[1],
        date: Date.strptime(match[2], "%Y%m%d"),
        time: "#{match[3][0..1]}:#{match[3][2..3]}"
      }
    rescue Date::Error
      nil
    end

    # O instante de uma aula a partir do id, ou nil se aquele horário não existe na grade. Sem
    # esta conferência, um id inventado materializaria uma aula às 3 da manhã.
    def self.virtual_start(class_group, parsed)
      return nil unless class_group.window_at(parsed[:date].wday, parsed[:time])

      hours, minutes = parsed[:time].split(":").map(&:to_i)
      class_group.zone.local(parsed[:date].year, parsed[:date].month, parsed[:date].day, hours, minutes)
    end

    def initialize(class_group, from_date, to_date)
      @class_group = class_group
      @zone = class_group.zone
      @from_date = from_date.in_time_zone(@zone).to_date
      @to_date = to_date.in_time_zone(@zone).to_date
    end

    # @return [Array<Hash>] no mesmo formato de `ClassSessionSerializer.one`: chaves em camelCase
    #   e datas em milissegundos.
    def call
      return [] unless @class_group.active

      preload_enrollments
      recorded = load_recorded
      taken = recorded.to_set { |session| session.slot_start.to_i }
      events = recorded.select { |session| in_period?(session.start) }.map { |session| ClassSessionSerializer.one(session) }

      first_day = [ @from_date, @class_group.start_date ].compact.max
      last_day = [ @to_date, @class_group.end_date ].compact.min

      each_occurrence(last_day) do |date, window|
        next if date < first_day

        start_at = local_time(date, window["start"])
        events << virtual_event(start_at, end_at(date, window, start_at)) unless taken.include?(start_at.to_i)
      end

      events.sort_by { |event| event[:start] }
    end

    private

    # As aulas gravadas que caem no período, ou cujo horário da grade cai nele. A origem só as via
    # quando coincidiam com a grade: a aula avulsa nunca aparecia no calendário, e a aula movida
    # sumia, com o horário antigo voltando como se nada tivesse mudado.
    def load_recorded
      @class_group.class_sessions.any_of(
        { :start.gte => period_start, :start.lt => period_end },
        { :slot_start.gte => period_start, :slot_start.lt => period_end }
      ).to_a
    end

    def period_start
      @period_start ||= @zone.local(@from_date.year, @from_date.month, @from_date.day)
    end

    def period_end
      @period_end ||= @zone.local(@to_date.year, @to_date.month, @to_date.day) + 1.day
    end

    def in_period?(time)
      time >= period_start && time < period_end
    end

    # A recorrência conta a partir de uma âncora fixa: o início da turma, ou a data em que ela foi
    # criada. A origem contava a partir do início do período pedido, e o resultado mudava conforme
    # o que a tela estava vendo: uma turma quinzenal aparecia toda semana na visão semanal, e
    # "10 ocorrências" nunca acabavam.
    def anchor
      @anchor ||= @class_group.start_date || @class_group.created_at&.in_time_zone(@zone)&.to_date || @from_date
    end

    def each_occurrence(last_day)
      count = 0
      current = limited_by_occurrences? ? anchor : [ anchor, @from_date ].max

      while current <= last_day
        if generates_week?(week_number(current))
          enabled_day(current.wday)&.fetch("windows")&.each do |window|
            yield(current, window)
            count += 1
            return if limited_by_occurrences? && count >= @class_group.recurrence_occurrences
          end
        end

        current += 1.day
      end
    end

    def limited_by_occurrences?
      @class_group.recurrence_end_type == "occurrences" && @class_group.recurrence_occurrences.present?
    end

    def week_number(date)
      ((date.beginning_of_week - anchor.beginning_of_week).to_i / 7)
    end

    def generates_week?(number)
      case @class_group.recurrence_type
      when "biweekly" then number.even?
      when "monthly" then (number % 4).zero?
      else true
      end
    end

    def enabled_day(day_of_week)
      @enabled_days ||= @class_group.schedule.select { |day| day["enabled"] }.index_by { |day| day["day_of_week"].to_i }
      @enabled_days[day_of_week]
    end

    def local_time(date, hhmm)
      hours, minutes = hhmm.split(":").map(&:to_i)
      @zone.local(date.year, date.month, date.day, hours, minutes)
    end

    def end_at(date, window, start_at)
      return local_time(date, window["end"]) if window["end"].present?

      start_at + (@class_group.default_duration_minutes || 60).minutes
    end

    def virtual_event(start_at, finish_at)
      {
        id: "#{VIRTUAL_ID_PREFIX}_#{@class_group.id}_#{start_at.strftime('%Y%m%d_%H%M')}",
        type: "class_session",
        virtual: true,
        start: ApplicationSerializer.epoch_ms(start_at),
        end: ApplicationSerializer.epoch_ms(finish_at),
        status: "active",
        title: @class_group.name,
        notes: nil,
        classGroupId: @class_group.id.to_s,
        classGroupName: @class_group.name,
        calendarId: @class_group.calendar_id&.to_s,
        color: @class_group.color,
        textColor: @class_group.text_color,
        instructorName: @class_group.instructor_name,
        room: @class_group.room,
        location: @class_group.location,
        enrollmentCount: enrollment_count(start_at),
        maxStudents: @class_group.max_students || 0,
        attendanceSummary: nil,
        scheduleDayOfWeek: start_at.wday,
        scheduleWindowStart: start_at.strftime("%H:%M")
      }
    end

    # Uma consulta por turma, não uma por aula.
    def preload_enrollments
      enrollments = @class_group.class_enrollments.active.to_a
      @enrolled_in_all = enrollments.select { |enrollment| enrollment.schedule_day_of_week.nil? }
      @enrolled_by_slot = enrollments.reject { |enrollment| enrollment.schedule_day_of_week.nil? }
                                     .group_by { |enrollment| [ enrollment.schedule_day_of_week, enrollment.schedule_window_start ] }
    end

    # Só conta quem já estava inscrito no dia da aula.
    def enrollment_count(start_at)
      limit = start_at.end_of_day
      slot = @enrolled_by_slot[[ start_at.wday, start_at.strftime("%H:%M") ]] || []

      (slot + @enrolled_in_all).count { |enrollment| enrollment.enrolled_at.nil? || enrollment.enrolled_at <= limit }
    end
  end
end
