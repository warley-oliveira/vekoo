module MiniRacerEngine::Workers
  # A agenda para quem escreve script. Os nomes `appointment.*` são contrato de quem escreve script e ficam como na origem,
  # sobre `Agenda::BookingService`. O calendário vinha do assistente: aqui é o calendário de profissionais mais antigo
  # da organização (`Agenda::Calendar.default_for`).
  #
  # `register` só faz `attach` e nada falha aqui: sem organização, ou sem calendário, o erro chega só a quem chamar. Na origem a
  # busca morava em `register`, e ela pesava em todo script da plataforma.
  class Scheduling < MiniRacerEngine::EngineModule
    def register(worker, context, event)
      @worker = worker
      context.attach("appointment.services", proc { |*params| attach_method(method(:services), params, event) })
      context.attach("appointment.serviceAvailableSlots", proc { |*params| attach_method(method(:service_available_slots), params, event) })
      context.attach("appointment.cancel", proc { |*params| attach_method(method(:cancel), params, event) })
      context.attach("appointment.employees", proc { |*params| attach_method(method(:employees), params, event) })
      context.attach("appointment.create", proc { |*params| attach_method(method(:create), params, event) })
      context.attach("appointment.scheduledList", proc { |*params| attach_method(method(:appointments), params, event) })
      context.attach("appointment.updateExternalId", proc { |*params| attach_method(method(:update_external_id), params, event) })
    end

    private

    def booking_service
      @booking_service ||= begin
        require_organization!
        calendar = ::Agenda::Calendar.default_for(organization_id)
        raise MiniRacerEngine::Error, "No calendar available" unless calendar

        ::Agenda::BookingService.new(calendar, chat: chat)
      end
    end

    def services(_params)
      booking_service.list_services
    end

    def service_available_slots(params)
      service_name, date_start, date_end, employee_name = params
      booking_service.available_slots(service_name: service_name, date_start: date_start, date_end: date_end, employee_name: employee_name)
    rescue ArgumentError => e
      { error: e.message }
    end

    def cancel(params)
      booking_service.cancel_booking(booking_id: params[0])
    end

    def employees(_params)
      booking_service.list_professionals
    end

    def create(params)
      employee_name, service_name, start_time, external_id = params
      booking_service.create_booking(employee_name: employee_name, service_name: service_name, start_time: start_time, external_id: external_id)
    end

    def update_external_id(params)
      booking_id, external_id = params
      booking_service.update_external_id(booking_id: booking_id, external_id: external_id)
    end

    def appointments(params)
      booking_service.list_bookings(params[0])
    end
  end
end
