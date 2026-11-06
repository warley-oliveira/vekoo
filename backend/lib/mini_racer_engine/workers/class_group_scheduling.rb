module MiniRacerEngine::Workers
  # Turmas para quem escreve script: `classGroup.*`, com os nomes e os textos da origem, que são contrato de quem escreve script.
  # O escopo é a organização do contexto, e o contato é o da conversa.
  class ClassGroupScheduling < MiniRacerEngine::EngineModule
    DAY_NAMES = %w[Domingo Segunda Terça Quarta Quinta Sexta Sábado].freeze
    DEFAULT_DAYS_AHEAD = 14
    MAX_DAYS_AHEAD = 90

    def register(worker, context, event)
      @worker = worker
      context.attach("classGroup.list", proc { |*params| attach_method(method(:list_groups), params, event) })
      context.attach("classGroup.availability", proc { |*params| attach_method(method(:availability), params, event) })
      context.attach("classGroup.enroll", proc { |*params| attach_method(method(:enroll), params, event) })
      context.attach("classGroup.unenroll", proc { |*params| attach_method(method(:unenroll), params, event) })
      context.attach("classGroup.myEnrollments", proc { |*params| attach_method(method(:my_enrollments), params, event) })
    end

    private

    def calendars
      ::Agenda::Calendar.where(organization_id: organization_id, calendar_type: "class_group")
    end

    def groups
      ::Agenda::ClassGroup.where(organization_id: organization_id, :calendar_id.in => calendars.pluck(:_id), active: true)
    end

    def available_spots(group)
      group.max_students ? [ group.max_students - group.active_enrollment_count, 0 ].max : nil
    end

    def list_groups(_params)
      require_organization!

      groups.where(visible: true).map do |group|
        {
          "name" => group.name,
          "description" => group.description,
          "available_spots" => available_spots(group),
          "schedule" => format_schedule(group.schedule)
        }
      end
    end

    def availability(params)
      require_organization!
      group = find_group_by_name(params[0])
      return { "error" => "Turma não encontrada" } unless group

      days_ahead = (params[1] || DEFAULT_DAYS_AHEAD).to_i.clamp(1, MAX_DAYS_AHEAD)
      zone = group.calendar.zone
      today = Time.current.in_time_zone(zone).to_date

      sessions = ::Agenda::SessionGeneratorService.new(group, today, today + days_ahead.days).call

      {
        "name" => group.name,
        "available_spots" => available_spots(group),
        "sessions" => sessions.reject { |session| session[:status] == "canceled" }.map { |session| session_slot(session, zone) }
      }
    end

    # As datas chegam em milissegundos, e o script recebe hora de parede, no fuso do calendário.
    def session_slot(session, zone)
      start_time = Time.zone.at(session[:start] / 1000.0).in_time_zone(zone)
      end_time = session[:end] && Time.zone.at(session[:end] / 1000.0).in_time_zone(zone)

      {
        "date" => start_time.iso8601,
        "end" => end_time&.iso8601,
        "day_of_week" => start_time.wday,
        "day_name" => DAY_NAMES[start_time.wday],
        "window_start" => start_time.strftime("%H:%M")
      }
    end

    def enroll(params)
      require_organization!
      return { "error" => "Contato não identificado" } unless chat

      day_of_week, window_start = schedule_of(params)
      group = find_group_by_name(params[0])
      return { "error" => "Turma não encontrada" } unless group
      return { "error" => "Turma lotada, sem vagas disponíveis" } if group.max_students && group.active_enrollment_count >= group.max_students
      return { "error" => "Contato já está inscrito neste horário" } if enrollment_for(group, day_of_week, window_start)

      enrollment = group.class_enrollments.create!(
        chat: chat,
        organization_id: organization_id,
        schedule_day_of_week: day_of_week,
        schedule_window_start: window_start
      )

      {
        "success" => true,
        "enrollment_id" => enrollment.id.to_s,
        "class_group_name" => group.name,
        "schedule_day_of_week" => day_of_week,
        "schedule_window_start" => window_start,
        "message" => "Inscrito com sucesso na turma #{group.name}"
      }
    rescue Mongoid::Errors::Validations => e
      { "error" => e.document.errors.full_messages.join(", ") }
    rescue Mongo::Error::OperationFailure
      # Dois cliques: o índice único segurou o segundo.
      { "error" => "Contato já está inscrito neste horário" }
    end

    def unenroll(params)
      require_organization!
      return { "error" => "Contato não identificado" } unless chat

      day_of_week, window_start = schedule_of(params)
      group = find_group_by_name(params[0])
      return { "error" => "Turma não encontrada" } unless group

      enrollment = enrollment_for(group, day_of_week, window_start)
      return { "error" => "Contato não está inscrito neste horário" } unless enrollment

      enrollment.update!(status: "canceled")

      {
        "success" => true,
        "class_group_name" => group.name,
        "schedule_day_of_week" => day_of_week,
        "schedule_window_start" => window_start,
        "message" => "Inscrição cancelada na turma #{group.name}"
      }
    end

    def my_enrollments(_params)
      require_organization!
      return { "error" => "Contato não identificado" } unless chat

      enrollments = ::Agenda::ClassEnrollment.where(organization_id: organization_id, chat_id: chat.id, status: "active").includes(:class_group)

      enrollments.filter_map do |enrollment|
        group = enrollment.class_group
        next unless group

        {
          "enrollment_id" => enrollment.id.to_s,
          "class_group_id" => group.id.to_s,
          "class_group_name" => group.name,
          "instructor_name" => group.instructor_name,
          "room" => group.room,
          "enrolled_at" => enrollment.enrolled_at&.iso8601
        }
      end
    end

    def schedule_of(params)
      [ params[1]&.to_i, params[2]&.to_s&.strip ]
    end

    def enrollment_for(group, day_of_week, window_start)
      group.class_enrollments.where(chat_id: chat.id, status: "active", schedule_day_of_week: day_of_week, schedule_window_start: window_start).take
    end

    def find_group_by_name(name)
      return nil if name.blank?

      groups.where(name: name.to_s.strip).order_by(created_at: :asc).first
    end

    def format_schedule(schedule)
      Array(schedule).select { |day| day["enabled"] }.map do |day|
        windows = Array(day["windows"]).map { |window| "#{window['start']}-#{window['end']}" }
        "#{DAY_NAMES[day['day_of_week'].to_i]}: #{windows.join(', ')}"
      end.join(" | ")
    end
  end
end
