module Agenda
  class ClassGroupsController < BaseController
    before_action :set_calendar
    before_action :set_own_class_group, only: %i[show update destroy]

    def index
      scope = @calendar.class_groups.order_by(name: :asc)
      scope = scope.active if params[:active].to_s == "true"
      scope = scope.visible if params[:visible].to_s == "true"
      records, meta = paginate(scope, per_page: Paginated::MAX_PER_PAGE)

      render json: { classGroups: ClassGroupSerializer.many(records), meta: meta }
    end

    def show
      render json: ClassGroupSerializer.one(@class_group)
    end

    def create
      class_group = @calendar.class_groups.new(class_group_params.merge(organization_id: current_organization.id))

      if class_group.save
        render json: ClassGroupSerializer.one(class_group), status: :created
      else
        render_invalid(class_group)
      end
    end

    # Mudar a grade leva junto as aulas futuras já materializadas e as inscrições.
    def update
      old_schedule = @class_group.schedule.deep_dup

      if @class_group.update(class_group_params)
        ClassGroupRescheduler.new(@class_group, old_schedule).call
        render json: ClassGroupSerializer.one(@class_group)
      else
        render_invalid(@class_group)
      end
    end

    def destroy
      @class_group.destroy!

      head :no_content
    end

    private

    def set_own_class_group
      @class_group = @calendar.class_groups.where(id: params[:id]).take
      render_not_found unless @class_group
    end

    def class_group_params
      envelope(:class_group).permit(
        :name, :description, :external_id, :color, :text_color, :max_students, :min_students,
        :default_duration_minutes, :start_date, :end_date, :location, :room, :address,
        :instructor_name, :instructor_account_id, :active, :visible, :recurrence_type,
        :recurrence_end_type, :recurrence_occurrences, :category, :price_cents, :price_currency,
        :notes, tags: [], schedule: [ :enabled, :day_of_week, { windows: %i[start end] } ]
      ).to_h
    end
  end
end
