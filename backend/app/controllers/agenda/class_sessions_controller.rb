module Agenda
  # As aulas de uma turma. Aceita o id da exceção gravada e o da aula calculada (`vcs_...`). Mexer
  # em uma aula calculada materializa o documento.
  class ClassSessionsController < BaseController
    before_action :set_calendar
    before_action :set_class_group
    before_action :set_slot, only: %i[show update cancel]

    # Só as exceções gravadas. As aulas calculadas de um período vêm em `GET /calendar-events`.
    def index
      sessions = @class_group.class_sessions
      sessions = sessions.active unless params[:include_canceled].to_s == "true"

      zone = @class_group.zone
      if params[:start].present? && params[:end].present?
        sessions = sessions.where(:start.gte => TimeInput.parse(params[:start], zone), :start.lte => TimeInput.parse(params[:end], zone))
      end

      records, meta = paginate(sessions.order_by(start: :asc), per_page: Paginated::MAX_PER_PAGE)

      render json: { sessions: ClassSessionSerializer.many(records), meta: meta }
    end

    def show
      render json: @slot.as_event.merge(attendances: @slot.attendees)
    end

    def create
      session = @class_group.class_sessions.new(session_attributes)

      if session.save
        render json: ClassSessionSerializer.one(session), status: :created
      else
        render_invalid(session)
      end
    end

    def update
      session = @slot.materialize!

      if session.update(session_attributes)
        render json: ClassSessionSerializer.one(session)
      else
        render_invalid(session)
      end
    end

    def cancel
      session = @slot.materialize!
      session.update!(status: "canceled")

      render json: ClassSessionSerializer.one(session)
    end

    private

    def set_slot
      @slot = SessionSlot.resolve(current_organization.id, params[:id], class_group: @class_group)
      render_not_found unless @slot
    end

    def session_attributes
      attributes = envelope(:class_session).permit(:start, :end, :title, :notes, :status, :color).to_h

      %w[start end].each do |key|
        attributes[key] = TimeInput.parse(attributes[key], @class_group.zone) if attributes.key?(key)
      end
      attributes
    end
  end
end
