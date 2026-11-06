module Agenda
  # As regras da agenda: disponibilidade, conflito, balanceamento e criar ou cancelar um horário.
  # É a interface que a extensão `scheduling` do motor de scripts usa (ver docs/migration/api/agenda.md).
  #
  # A origem também rodava aqui as funções do assistente. Sem assistente, ficam só as regras, e o
  # calendário vem de quem chama: `Agenda::BookingService.new(calendar, chat: chat)`.
  #
  # Os erros saem em inglês, como na origem, porque são para o script ou para o modelo que chamou,
  # e não para a tela.
  class BookingService
    class UnavailableSlot < StandardError; end

    # Sem horário no intervalo pedido, olha até 30 dias à frente antes de desistir.
    FALLBACK_WINDOW = 30.days

    attr_reader :calendar

    def initialize(calendar, chat: nil)
      @calendar = calendar
      @chat = chat
      @created_booking = false
    end

    def created_booking?
      @created_booking
    end

    def zone
      calendar.zone
    end

    # Pode marcar este profissional, neste serviço, neste instante?
    def booking_allowed?(professional_id, service_id, requested_start)
      service = calendar.services.where(id: service_id).take
      professional = calendar.professionals.where(id: professional_id).take
      return false unless service && professional

      rule = professional.rule
      return false unless rule

      requested_start = requested_start.in_time_zone(zone)
      requested_end = requested_start + service.duration.minutes

      inside_window?(rule, requested_start, requested_end) &&
        !blocked_or_booked?(rule, requested_start, service.duration, professional.id, service)
    end

    # @param date_start, date_end [String, Time, Date] texto vale como hora de parede no fuso do calendário
    # @return [Hash] { employee_name:, service_name:, available_slots: { "terça-feira, 2026-11-10" => ["09:00"] } }, ou { error: }
    def available_slots(service_name:, date_start:, date_end:, employee_name: nil, time_fallback: false)
      raise ArgumentError, "service_name cannot be blank" if service_name.blank?
      raise ArgumentError, "date_start cannot be blank" if date_start.blank?
      raise ArgumentError, "date_end cannot be blank" if date_end.blank?

      date_start = TimeInput.local(date_start, zone) || raise(ArgumentError, "date_start is invalid")
      date_end = TimeInput.local(date_end, zone) || raise(ArgumentError, "date_end is invalid")
      date_start = Time.current.in_time_zone(zone) + 15.minutes if date_start <= Time.current

      service = calendar.services.where(name: service_name).take
      return { error: "service doesn't exists", use_one_of_this_services: Offering.where(calendar_id: calendar.id).pluck(:name) } unless service

      priority = priority_professional(service, date_start)

      if employee_name.present?
        professional = calendar.professionals.where(name: employee_name).take
        return { error: "employee not found", employee_with_priority: priority&.name } unless professional

        unless professional.service_ids.include?(service.id)
          return not_allowed_response(service, date_start, priority)
        end
      else
        professional = priority
      end

      slots = open_slots(service, professional, date_start.to_date, date_end.to_date)

      begin
        grouped = slots_by_day(slots, first_day: time_fallback)
        response = { employee_name: professional&.name, service_name: service.name, available_slots: grouped }
        response[:employee_with_priority] = priority.name if priority && professional && professional.name != priority.name
        response[:messages] = "No available slots were found for the queried date. The next available slots are on #{grouped.keys.first}" if time_fallback
        response
      rescue UnavailableSlot => e
        return { error: e.message } if time_fallback

        available_slots(
          service_name: service_name,
          date_start: date_start,
          date_end: date_end + FALLBACK_WINDOW,
          employee_name: employee_name,
          time_fallback: true
        )
      end
    end

    def list_services(**_args)
      list = Offering.where(calendar_id: calendar.id).map do |service|
        {
          "service_name" => service.name,
          "duration" => service.duration,
          "description" => service.description,
          "employee_with_priority" => professional_named_by(service.scheduler_balancer),
          "external_id" => service.external_id
        }.compact
      end

      list.presence || { error: "No service available" }
    end

    def list_professionals(**_args)
      names = Offering.where(calendar_id: calendar.id).pluck(:_id, :name).to_h

      list = Professional.where(calendar_id: calendar.id).map do |professional|
        {
          "name" => professional.name,
          "external_id" => professional.external_id,
          "list_of_allowed_services_of_this_employee" => professional.service_ids.filter_map { |id| names[id] }
        }.compact
      end

      list.presence || { error: "No employee available" }
    end

    def cancel_booking(booking_id:)
      booking = calendar.bookings.where(id: booking_id).take
      return { message: "Booking not found" } unless booking

      connector_events.delete_booking_connector_call(booking)
      booking.update(status: "canceled")
      { message: "Booking canceled successfully" }
    end

    # O deslocamento do texto é ignorado de propósito: "2026-11-10T10:00Z" é 10:00 no fuso do
    # calendário, porque quem chama (script ou modelo) pensa em hora de parede.
    def create_booking(employee_name:, service_name:, start_time:, external_id: nil)
      start_time = TimeInput.local(start_time, zone)
      return { error: "start_time is invalid" } unless start_time

      professional = calendar.professionals.where(name: employee_name).take
      return { error: "this employee does not exist" } unless professional

      service = calendar.services.where(name: service_name).take
      return { error: "this service does not exist" } unless service

      rule = professional.rule
      return { error: "this employee is not available on this day" } if rule.nil? || rule.windows_on(start_time.wday).empty?

      unless professional.service_ids.include?(service.id)
        return {
          error: "this employee does not perform this service",
          employees_can_perform_this_service: calendar.professionals.where(service_ids: service.id).pluck(:name)
        }
      end

      if blocked_or_booked?(rule, start_time, service.duration, professional.id, service)
        return {
          message: "This slot is not available",
          next_available_slots: available_slots(
            service_name: service_name, date_start: start_time, date_end: start_time + 3.days, employee_name: employee_name
          )
        }
      end

      booking = Booking.create!(
        calendar: calendar,
        professional: professional,
        service: service,
        chat: @chat,
        start: start_time,
        end: start_time + service.duration.minutes,
        external_id: external_id
      )
      @created_booking = true

      {
        success: true,
        message: "Booking created successfully",
        booking_id: booking.id.to_s,
        service_external_id: service.external_id,
        employee_external_id: professional.external_id,
        employee_account_id: professional.account_id,
        service_duration: service.duration,
        message_instruction: service.success_message.presence
      }.compact
    end

    def update_external_id(booking_id:, external_id:)
      booking = calendar.bookings.where(id: booking_id).take
      return { error: "Booking not found" } unless booking

      booking.update(external_id: external_id)
      { success: true }
    end

    # Os agendamentos ainda por vir da conversa. Com `full_fields`, o profissional inteiro.
    def list_bookings(full_fields = false)
      return [] unless @chat

      @chat.bookings.active.where(:start.gte => 1.hour.ago).order_by(start: :asc).map do |booking|
        item = {
          "id" => booking.id.to_s,
          "external_id" => booking.external_id,
          "start" => booking.local_start.strftime("%Y-%m-%d %H:%M"),
          "end" => booking.end.in_time_zone(zone).strftime("%Y-%m-%d %H:%M"),
          "service_name" => booking.service_name
        }
        if full_fields
          item["employee"] = { "name" => booking.professional&.name, "email" => booking.professional&.user_email, "external_id" => booking.professional&.external_id }
        else
          item["employee_name"] = booking.employee_name
        end
        item
      end
    end

    # O horário bate em um bloqueio, ou já está cheio? Considera o intervalo antes e depois do
    # serviço (`buffer_*`), e a lotação (`guest_limit`).
    def blocked_or_booked?(rule, start_at, duration, professional_id = nil, service = nil)
      range_start, range_end = occupied_range(start_at, duration, service)
      return true if blocked?(rule, range_start, range_end)

      scope = calendar.bookings.active.where(:start.lt => range_end, :end.gt => range_start)
      scope = scope.where(professional_id: professional_id) if professional_id

      scope.count >= (service&.guest_limit || 1)
    end

    private

    attr_reader :chat

    def connector_events
      ConnectorEventService.new(calendar.organization, @chat)
    end

    def priority_professional(service, date)
      id = service.scheduler_balancer(date: date, period: calendar.rebalancing_period)
      id && calendar.professionals.where(id: id).take
    end

    def professional_named_by(id)
      id && calendar.professionals.where(id: id).pick(:name)
    end

    def not_allowed_response(service, date_start, priority)
      others = calendar.professionals.where(service_ids: service.id).pluck(:name)

      {
        error: "employee not allowed to perform this service. Try another professional.",
        employees_with_priority: priority&.name,
        employees_can_perform_this_service: available_slots(
          service_name: service.name, date_start: date_start, date_end: date_start + 2.days, employee_name: others.first
        )
      }
    end

    # Monta tudo com uma consulta por profissional, em vez de uma por horário: num intervalo de
    # 30 dias, de 15 em 15 minutos, seriam milhares de contagens.
    def open_slots(service, professional, first_day, last_day)
      rules = rules_for(service, professional)
      range = zone.local(first_day.year, first_day.month, first_day.day)..(zone.local(last_day.year, last_day.month, last_day.day) + 1.day)
      taken = taken_intervals(rules.map(&:professional_id), range)
      now = Time.current

      rules.flat_map { |rule|
        (first_day..last_day).flat_map do |date|
          rule.windows_on(date.wday).flat_map do |window|
            window_slots(date, window, service).select do |slot|
              slot > now && free?(rule, slot, service, taken[rule.professional_id] || [])
            end
          end
        end
      }.uniq.sort
    end

    # Todos com regra quando ninguém foi escolhido. Isto só acontece com serviço sem distribuição.
    def rules_for(_service, professional)
      return [ professional.rule ].compact if professional

      Rule.where(:professional_id.in => Professional.where(calendar_id: calendar.id).pluck(:_id)).to_a
    end

    def taken_intervals(professional_ids, range)
      calendar.bookings.active
              .where(:professional_id.in => professional_ids, :start.lt => range.last, :end.gt => range.first)
              .pluck(:professional_id, :start, :end)
              .group_by(&:first)
              .transform_values { |rows| rows.map { |_, start_at, end_at| [ start_at, end_at ] } }
    end

    # O início precisa deixar o serviço inteiro dentro da janela: a origem oferecia 16:45 para um
    # serviço de uma hora numa janela até as 17:00.
    def window_slots(date, window, service)
      slot = local_time(date, window["start"])
      closing = local_time(date, window["end"])
      step = service.time_increment_interval.minutes
      duration = service.duration.minutes
      slots = []

      while slot + duration <= closing
        slots << slot
        slot += step
      end
      slots
    end

    def free?(rule, slot, service, taken)
      range_start, range_end = occupied_range(slot, service.duration, service)
      return false if blocked?(rule, range_start, range_end)

      taken.count { |start_at, end_at| start_at < range_end && end_at > range_start } < (service.guest_limit || 1)
    end

    def occupied_range(start_at, duration, service)
      [ start_at - service&.buffer_before.to_i.minutes, start_at + duration.to_i.minutes + service&.buffer_after.to_i.minutes ]
    end

    def blocked?(rule, range_start, range_end)
      Array(rule&.blocked_times).any? do |blocked|
        blocked_start = TimeInput.local(blocked["start"], zone)
        blocked_end = TimeInput.local(blocked["end"], zone)
        blocked_start && blocked_end && range_start < blocked_end && range_end > blocked_start
      end
    end

    def inside_window?(rule, requested_start, requested_end)
      rule.windows_on(requested_start.wday).any? do |window|
        requested_start >= local_time(requested_start.to_date, window["start"]) &&
          requested_end <= local_time(requested_start.to_date, window["end"])
      end
    end

    def local_time(date, hhmm)
      hours, minutes = hhmm.split(":").map(&:to_i)
      zone.local(date.year, date.month, date.day, hours, minutes)
    end

    def slots_by_day(slots, first_day: false)
      grouped = slots.group_by { |slot| descriptive_date(slot.to_date) }
      grouped = grouped.first(1).to_h if first_day
      grouped = grouped.transform_values { |day| day.map { |slot| slot.strftime("%H:%M") } }

      grouped.presence || raise(UnavailableSlot, "No available slots")
    end

    def descriptive_date(date)
      "#{I18n.l(date, format: '%A', locale: :"pt-BR")}, #{date.strftime('%Y-%m-%d')}"
    end
  end
end
