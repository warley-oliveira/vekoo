module Agenda
  # O calendário em si: agendamentos e aulas de um intervalo, e o que se faz com um agendamento.
  # A aula calculada tem as próprias rotas, em `class-sessions`.
  class CalendarEventsController < BaseController
    before_action :set_booking, only: %i[update destroy enroll_sequence unenroll_sequence]

    def index
      render json: { events: EventQuery.new(current_organization, event_filters).call }
    rescue EventQuery::RangeTooLong
      render_error(status: :unprocessable_entity, code: "rangeTooLong", message: t("agenda.errors.range_too_long"))
    end

    # Os dias com evento, para o mini calendário.
    def month_counts
      zone = current_organization.agenda_zone
      now = zone.now

      render json: MonthCounts.new(
        current_organization,
        range_start: TimeInput.parse(params[:start], zone) || now.beginning_of_month,
        range_end: TimeInput.parse(params[:end], zone) || now.end_of_month
      ).call
    end

    # As opções do painel de filtros, em uma ida só.
    def filters
      render json: {
        calendars: current_organization.agenda_calendars.order_by(created_at: :asc).map { |calendar| option(calendar).merge(timeZone: calendar.time_zone, calendarType: calendar.calendar_type) },
        professionals: current_organization.agenda_professionals.order_by(name: :asc).map { |professional| option(professional).merge(calendarId: professional.calendar_id.to_s, color: professional.color) },
        services: current_organization.agenda_services.order_by(name: :asc).map { |service| option(service).merge(calendarId: service.calendar_id.to_s) },
        tags: ChatTagSerializer.many(current_organization.chat_tags.order_by(name: :asc)),
        teams: current_organization.teams.order(:name).map { |team| { id: team.id, name: team.name } }
      }
    end

    def create
      calendar = Calendar.scoped(current_organization.id, event_params[:calendar_id])
      booking = Booking.new(booking_attributes(calendar&.zone).merge(calendar: calendar, organization_id: current_organization.id))

      if booking.save
        render json: BookingSerializer.one(booking), status: :created
      else
        render_invalid(booking)
      end
    end

    def update
      if @booking.update(booking_attributes(@booking.zone))
        render json: BookingSerializer.one(@booking)
      else
        render_invalid(@booking)
      end
    end

    # Some da tela e do Google, mas continua no banco, com o histórico.
    def destroy
      @booking.event_user_name = current_account.name
      @booking.update!(status: "archived")

      head :no_content
    end

    def enroll_sequence
      result = EnrollAttendanceSequenceService.new(@booking, params.require(:sequence_id)).call
      return render_error(status: :unprocessable_entity, code: result.code, message: result.message) unless result.success?

      render json: {
        enrolledSequenceId: @booking.enrolled_sequence_id,
        sequenceEnrolledAt: ApplicationSerializer.epoch_ms(@booking.sequence_enrolled_at),
        steps: result.data[:steps].map { |step| { stepId: step[:step_id], runAt: ApplicationSerializer.epoch_ms(step[:run_at]) } }
      }
    end

    # Os passos que faltam chegam e não fazem nada: o token deixou de valer.
    def unenroll_sequence
      @booking.event_user_name = current_account.name
      @booking.push_history("event_name" => "sequence_unenrolled", "sequence_id" => @booking.enrolled_sequence_id)
      @booking.update!(sequence_token: nil, enrolled_sequence_id: nil, sequence_enrolled_at: nil)

      head :no_content
    end

    private

    def set_booking
      @booking = Booking.scoped(current_organization.id, params[:id] || params[:calendar_event_id])
      render_not_found unless @booking
    end

    def option(record)
      { id: record.id.to_s, name: record.name }
    end

    def event_filters
      params.permit(:start, :end, :chat_id, :calendar_ids, :service_ids, :professional_ids, :tag_ids,
                    calendar_ids: [], service_ids: [], professional_ids: [], tag_ids: [])
            .to_h.symbolize_keys
    end

    def event_params
      @event_params ||= envelope(:event).permit(
        :calendar_id, :start, :end, :color, :title, :description, :status, :attendance_status,
        :professional_id, :service_id, :chat_id, :external_id
      ).to_h
    end

    # Limpar um campo (comparecimento, conversa, profissional) chega como texto vazio ou nulo.
    def booking_attributes(zone)
      attributes = event_params.except("calendar_id")

      %w[attendance_status professional_id service_id chat_id].each do |key|
        attributes[key] = nil if attributes.key?(key) && attributes[key].blank?
      end
      %w[start end].each do |key|
        attributes[key] = TimeInput.parse(attributes[key], zone || current_organization.agenda_zone) if attributes.key?(key)
      end

      attributes.merge(event_user_name: current_account.name)
    end
  end
end
