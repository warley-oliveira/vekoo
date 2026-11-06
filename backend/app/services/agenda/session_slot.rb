module Agenda
  # Uma aula, com ou sem documento. A API aceita os dois ids: o da exceção gravada e o calculado
  # (`vcs_...`). Qualquer ação em uma aula calculada materializa o documento primeiro.
  class SessionSlot
    # Id de quem está inscrito e ainda não tem registro de presença.
    PENDING_PREFIX = "ve_".freeze

    attr_reader :class_group, :session

    # Acha a aula a partir do id que veio da API, sempre pela organização. Com `class_group`, a aula
    # precisa ser dela.
    #
    # @return [SessionSlot, nil] nil se não existir ou não for da organização
    def self.resolve(organization_id, id, class_group: nil)
      if SessionGeneratorService.virtual_id?(id)
        resolve_virtual(organization_id, id, class_group)
      else
        resolve_real(organization_id, id, class_group)
      end
    end

    def self.resolve_virtual(organization_id, id, class_group)
      parsed = SessionGeneratorService.parse_virtual_id(id)
      return nil unless parsed

      group = ClassGroup.scoped(organization_id, parsed[:class_group_id])
      return nil unless group && (class_group.nil? || class_group.id == group.id)

      start_at = SessionGeneratorService.virtual_start(group, parsed)
      return nil unless start_at

      new(group, session: group.class_sessions.where(start: start_at).take, virtual_start: start_at, virtual_id: id)
    end
    private_class_method :resolve_virtual

    def self.resolve_real(organization_id, id, class_group)
      session = ClassSession.scoped(organization_id, id)
      return nil unless session && (class_group.nil? || class_group.id == session.class_group_id)

      new(session.class_group, session: session)
    end
    private_class_method :resolve_real

    def initialize(class_group, session: nil, virtual_start: nil, virtual_id: nil)
      @class_group = class_group
      @session = session
      @virtual_start = virtual_start
      @virtual_id = virtual_id
    end

    def virtual?
      session.nil?
    end

    def start_at
      (session&.start || @virtual_start).in_time_zone(class_group.zone)
    end

    def end_at
      session&.end&.in_time_zone(class_group.zone) || class_group.session_end_for(start_at)
    end

    def slot
      { day_of_week: start_at.wday, window_start: start_at.strftime("%H:%M") }
    end

    # Quem está inscrito neste horário, e já estava no dia da aula.
    def enrollments
      class_group.class_enrollments.active.for_slot(slot).enrolled_by(start_at)
    end

    # Dois cliques ao mesmo tempo: quem perde a corrida fica com a aula do outro (índice único).
    def materialize!
      @session ||= class_group.class_sessions.create!(start: start_at, end: end_at)
    rescue Mongo::Error::OperationFailure => e
      raise unless e.code == 11_000

      @session = class_group.class_sessions.where(start: start_at).take
    end

    # Os registros de presença, mais quem está inscrito e ainda não foi marcado.
    def attendees
      records = session ? session.class_attendances.to_a : []
      taken_chats = records.map(&:chat_id)
      taken_enrollments = records.filter_map(&:class_enrollment_id)
      pending = enrollments.to_a.reject { |enrollment| taken_enrollments.include?(enrollment.id) || taken_chats.include?(enrollment.chat_id) }
      chats = ContactLookup.for(records + pending)

      records.map { |attendance| ClassAttendanceSerializer.one(attendance, chats[attendance.chat_id]) } +
        pending.map { |enrollment| ClassAttendanceSerializer.pending(enrollment, chats[enrollment.chat_id]) }
    end

    # A aula para a tela. Calculada, com os mesmos campos da exceção gravada.
    def as_event
      return ClassSessionSerializer.one(session) if session

      SessionGeneratorService.new(class_group, start_at, start_at).call.find { |event| event[:id] == @virtual_id } || virtual_event
    end

    def broadcast_attendance
      AgendaChannel.broadcast_event(
        class_group.organization_id,
        {
          action: "attendance_update",
          type: "class_session",
          classSessionId: session&.id&.to_s,
          classGroupId: class_group.id.to_s,
          scheduleDayOfWeek: slot[:day_of_week],
          scheduleWindowStart: slot[:window_start],
          attendanceSummary: session&.attendance_summary,
          enrollmentCount: session&.enrollment_count
        }
      )
    end

    def self.broadcast_enrollment(class_group, slot)
      count = class_group.class_enrollments.active.for_slot(slot).count

      AgendaChannel.broadcast_event(
        class_group.organization_id,
        {
          action: "enrollment_update",
          type: "class_session",
          classGroupId: class_group.id.to_s,
          scheduleDayOfWeek: slot[:day_of_week],
          scheduleWindowStart: slot[:window_start],
          enrollmentCount: count
        }
      )
    end

    private

    # A aula calculada fora do que a grade gera hoje (turma pausada, período já encerrado): ainda
    # dá para abrir o que foi registrado nela.
    def virtual_event
      {
        id: @virtual_id,
        type: "class_session",
        virtual: true,
        start: ApplicationSerializer.epoch_ms(start_at),
        end: ApplicationSerializer.epoch_ms(end_at),
        status: "active",
        title: class_group.name,
        notes: nil,
        classGroupId: class_group.id.to_s,
        classGroupName: class_group.name,
        calendarId: class_group.calendar_id&.to_s,
        color: class_group.color,
        textColor: class_group.text_color,
        instructorName: class_group.instructor_name,
        room: class_group.room,
        location: class_group.location,
        enrollmentCount: enrollments.count,
        maxStudents: class_group.max_students || 0,
        attendanceSummary: nil,
        scheduleDayOfWeek: slot[:day_of_week],
        scheduleWindowStart: slot[:window_start]
      }
    end
  end
end
