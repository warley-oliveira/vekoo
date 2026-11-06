module Agenda
  # A exclusão não tem rota, como na origem na prática: lá `DELETE` respondia 204 sem apagar nada.
  # Apagar um calendário leva junto agendamentos e histórico, e isso precisa de decisão de produto.
  class CalendarsController < BaseController
    before_action :set_own_calendar, only: %i[show update]

    def index
      records, meta = paginate(current_organization.agenda_calendars.order_by(created_at: :asc), per_page: Paginated::MAX_PER_PAGE)

      render json: { calendars: CalendarSerializer.many(records), meta: meta }
    end

    def show
      render json: CalendarSerializer.one(@calendar)
    end

    def create
      calendar = Calendar.new(calendar_params.merge(organization_id: current_organization.id))

      if calendar.save
        render json: CalendarSerializer.one(calendar), status: :created
      else
        render_invalid(calendar)
      end
    end

    def update
      if @calendar.update(calendar_params)
        render json: CalendarSerializer.one(@calendar)
      else
        render_invalid(@calendar)
      end
    end

    private

    def set_own_calendar
      @calendar = Calendar.scoped(current_organization.id, params[:id])
      render_not_found unless @calendar
    end

    def calendar_params
      received = envelope(:calendar)
      permitted = received.permit(
        :name, :description, :time_zone, :rebalancing_period, :calendar_type, :color,
        :scheduling_notification_enabled, :professional_whatsapp_connector_id,
        :scheduling_notification_reactivate_automation, :scheduling_notification_ignore_automation_paused,
        professional_notifications_settings: %i[time_before period message push whatsapp],
        professional_event_notifications: %i[event push whatsapp message],
        scheduling_notification_config: %i[interval period message ai_prompt]
      ).to_h

      %w[professional_notifications_settings professional_event_notifications scheduling_notification_config]
        .reduce(permitted) { |result, key| rule_list(result, received, key) }
        .then { |result| check_connector(result) }
    end

    # O canal é de escolha da pessoa: de outra organização, é como se não tivesse sido escolhido.
    def check_connector(permitted)
      id = permitted["professional_whatsapp_connector_id"]
      permitted["professional_whatsapp_connector_id"] = nil if id.present? && !Connector::Base.scoped(current_organization.id, id)
      permitted
    end
  end
end
