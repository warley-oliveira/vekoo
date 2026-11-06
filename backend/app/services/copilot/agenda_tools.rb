# frozen_string_literal: true

module Copilot
  # As ferramentas de agenda do copiloto, sobre `Agenda::Booking`. Exigem `calendar`, conferido em
  # `ToolExecutor#dispatch`: quem atende mas não vê a agenda não cancela agendamento pelo copiloto.
  #
  # O calendário da pessoa não filtra por `chat_list_to`, e aqui também não: a mesma lista da tela. O que
  # lê mensagem (`qualify_appointments`) passa por `Chat.visible_to`, dentro do analisador.
  module AgendaTools
    NO_SERVICE = "Sem serviço"
    NO_PROFESSIONAL = "Sem profissional"

    private

    def tool_list_appointments(args)
      scope = listed_bookings

      if args["chat_id"].present?
        record = find_chat(args["chat_id"])
        # Na origem, conversa que não existia sumia do filtro, e a resposta trazia todos os agendamentos.
        return not_found unless record

        scope = scope.where(chat_id: record.id)
      end

      scope = scope.where(status: args["status"]) if args["status"].present?
      scope = within_period(scope, args)

      records = scope.order_by(start: :desc).limit(bounded(args["limit"], default: 10, max: 25)).to_a
      Agenda::BookingSerializer::Context.new(records)

      { total: scope.count, returned: records.size, appointments: records.map { |booking| appointment_summary(booking) } }
    end

    def tool_get_appointment_details(args)
      booking = find_booking(args["appointment_id"])
      return appointment_not_found unless booking

      # A conversa escopada pela organização: a associação sozinha buscaria só pelo id.
      Agenda::BookingSerializer::Context.new([ booking ])

      {
        id: booking.id.to_s,
        status: booking.status,
        attendance_status: booking.attendance_status,
        title: booking.title,
        description: booking.description,
        start: format_time(booking.start),
        end: format_time(booking.end),
        professional: booking.employee_name,
        service: booking.service_name,
        calendar: booking.calendar&.name,
        chat_id: booking.chat_id&.to_s,
        user_name: booking.user_name,
        google_meet_url: booking.google_meet_url,
        event_history: Array(booking.event_history).last(5)
      }
    end

    def tool_cancel_appointment(args)
      booking = find_booking(args["appointment_id"])
      return appointment_not_found unless booking
      return { success: true, appointment_id: booking.id.to_s, status: "canceled", already_canceled: true } if booking.canceled?

      # O `update` é o caminho de sempre: os lembretes saem da fila, o Google é avisado e o profissional recebe o aviso.
      booking.event_user_name = account.name
      booking.update!(status: "canceled")
      @changes_applied << { action: "cancel_appointment", appointmentId: booking.id.to_s, reason: args["reason"] }

      { success: true, appointment_id: booking.id.to_s, status: "canceled" }
    end

    def tool_reschedule_appointment(args)
      booking = find_booking(args["appointment_id"])
      return appointment_not_found unless booking
      return { error: I18n.t("inbox.copilot.appointment_not_active") } unless booking.active?

      # Hora de parede, no fuso do calendário: "10:00" é 10:00 no negócio, venha o deslocamento que vier.
      new_start = Agenda::TimeInput.local(args["new_start"], booking.zone)
      return { error: I18n.t("inbox.copilot.invalid_appointment_time") } unless new_start

      new_end = args["new_end"].present? ? Agenda::TimeInput.local(args["new_end"], booking.zone) : new_start + (booking.end - booking.start)
      return { error: I18n.t("inbox.copilot.invalid_appointment_time") } unless new_end

      booking.event_user_name = account.name
      return { error: booking.errors.full_messages.first } unless booking.update(start: new_start, end: new_end)

      @changes_applied << { action: "reschedule_appointment", appointmentId: booking.id.to_s, newStart: format_time(new_start), newEnd: format_time(new_end) }

      { success: true, appointment_id: booking.id.to_s, new_start: format_time(new_start), new_end: format_time(new_end) }
    end

    # Uma chamada ao modelo por conversa: por isso o teto é o do analisador. Na origem pedia até 25, e os
    # que passavam de 10 voltavam como "sem conversa vinculada".
    def tool_qualify_appointments(args)
      scope = listed_bookings.where(status: args["status"].presence || "active")
      scope = within_period(scope, args)

      records = scope.order_by(start: :desc).limit(bounded(args["limit"], default: ConversationAnalyzer::MAX_BATCH_SIZE, max: ConversationAnalyzer::MAX_BATCH_SIZE)).to_a
      return { appointments: [], summary: "Nenhum agendamento encontrado." } if records.empty?

      Agenda::BookingSerializer::Context.new(records)

      chat_ids = records.filter_map { |booking| booking.chat_id&.to_s }.uniq
      analysis = analyzer.analyze_batch(chat_ids, context: :booking_qualification, user_question: args["user_question"])
      collect_analyzer_activities
      qualifications = Array(analysis[:chats]).index_by { |entry| entry[:chat_id] }

      entries = records.map { |booking| qualified_entry(booking, qualifications[booking.chat_id&.to_s]) }
      disqualified, qualified = entries.partition { |entry| entry[:is_test] || (entry[:qualification_score] && entry[:qualification_score] <= 2) }

      {
        total_appointments: records.size,
        qualified_count: qualified.size,
        disqualified_count: disqualified.size,
        analysis_summary: analysis[:summary],
        qualified_appointments: qualified.sort_by { |entry| -(entry[:qualification_score] || 0) },
        disqualified_appointments: disqualified
      }
    end

    # Uma agregação só, com todas as combinações, e as contas em Ruby. A origem carregava cada agendamento do
    # período e buscava serviço e profissional um por um.
    def tool_get_appointment_stats(args)
      from = parse_date(args["date_from"])&.beginning_of_day || 30.days.ago.beginning_of_day
      to = parse_date(args["date_to"])&.end_of_day || current_time
      rows = appointment_cube(listed_bookings.where(:start.gte => from, :start.lte => to))

      total = sum_cube(rows)
      canceled = sum_cube(rows) { |key| key["status"] == "canceled" }
      past_active = rows.select { |row| row["_id"]["status"] == "active" && row["_id"]["past"] }
      shows = sum_cube(past_active) { |key| key["attendance"] == "show" }
      no_shows = sum_cube(past_active) { |key| key["attendance"] == "no_show" }

      {
        period: { from: format_time(from), to: format_time(to) },
        total: total,
        active: sum_cube(rows) { |key| key["status"] == "active" },
        canceled: canceled,
        cancellation_rate: percentage(canceled, total),
        attendance: {
          show: shows,
          no_show: no_shows,
          pending: sum_cube(past_active) - shows - no_shows,
          no_show_rate: percentage(no_shows, shows + no_shows)
        },
        by_service: stats_by_service(rows),
        by_professional: stats_by_professional(rows)
      }
    end

    def listed_bookings
      Agenda::Booking.where(organization_id: organization.id.to_s).listed
    end

    def find_booking(id)
      return nil if id.blank?

      listed_bookings.where(id: id.to_s).take
    end

    def appointment_not_found
      { error: I18n.t("inbox.copilot.appointment_not_found") }
    end

    def within_period(scope, args)
      from = parse_date(args["date_from"])
      to = parse_date(args["date_to"])
      scope = scope.where(:start.gte => from.beginning_of_day) if from
      scope = scope.where(:start.lte => to.end_of_day) if to
      scope
    end

    def appointment_summary(booking)
      {
        id: booking.id.to_s,
        status: booking.status,
        attendance_status: booking.attendance_status,
        title: booking.title,
        start: format_time(booking.start),
        end: format_time(booking.end),
        professional: booking.employee_name,
        service: booking.service_name,
        chat_id: booking.chat_id&.to_s,
        user_name: booking.user_name
      }
    end

    def qualified_entry(booking, qualification)
      appointment_summary(booking).merge(
        qualification_score: qualification && qualification[:qualification_score],
        qualification_level: qualification ? qualification[:qualification] : "sem_analise",
        qualification_reason: qualification ? qualification[:reason] : I18n.t("inbox.copilot.no_linked_chat"),
        is_test: qualification ? qualification[:is_test] : false,
        key_signals: qualification ? qualification[:key_signals] : [],
        recommended_action: qualification && qualification[:recommended_action]
      )
    end

    def appointment_cube(scope)
      Agenda::Booking.collection.aggregate(
        [
          { "$match" => scope.selector },
          {
            "$group" => {
              "_id" => {
                "service" => "$service_id",
                "professional" => "$professional_id",
                "status" => "$status",
                "attendance" => "$attendance_status",
                "past" => { "$lte" => [ "$start", Time.current ] }
              },
              "count" => { "$sum" => 1 }
            }
          }
        ]
      ).to_a
    end

    def sum_cube(rows)
      rows.sum { |row| !block_given? || yield(row["_id"]) ? row["count"] : 0 }
    end

    def percentage(part, whole)
      whole.positive? ? (part * 100.0 / whole).round(1) : 0
    end

    def stats_by_service(rows)
      names = organization.agenda_services.where(:_id.in => rows.filter_map { |row| row["_id"]["service"] }.uniq).pluck(:id, :name).to_h

      rows.group_by { |row| row["_id"]["service"] }.map do |id, group|
        shows = sum_cube(group) { |key| key["attendance"] == "show" }
        no_shows = sum_cube(group) { |key| key["attendance"] == "no_show" }

        {
          service: names[id] || NO_SERVICE,
          total: sum_cube(group),
          active: sum_cube(group) { |key| key["status"] == "active" },
          canceled: sum_cube(group) { |key| key["status"] == "canceled" },
          show: shows,
          no_show: no_shows,
          no_show_rate: percentage(no_shows, shows + no_shows)
        }
      end.sort_by { |entry| -entry[:total] }.first(10)
    end

    # Só os ativos, como na origem: cancelado não diz nada sobre quem atendeu.
    def stats_by_professional(rows)
      active = rows.select { |row| row["_id"]["status"] == "active" }
      names = organization.agenda_professionals.where(:_id.in => active.filter_map { |row| row["_id"]["professional"] }.uniq).pluck(:id, :name).to_h

      active.group_by { |row| row["_id"]["professional"] }.map do |id, group|
        {
          professional: names[id] || NO_PROFESSIONAL,
          appointments: sum_cube(group),
          show: sum_cube(group) { |key| key["attendance"] == "show" },
          no_show: sum_cube(group) { |key| key["attendance"] == "no_show" }
        }
      end.sort_by { |entry| -entry[:appointments] }.first(10)
    end
  end
end
