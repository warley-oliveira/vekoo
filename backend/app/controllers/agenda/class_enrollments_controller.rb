module Agenda
  class ClassEnrollmentsController < BaseController
    before_action :set_calendar
    before_action :set_class_group
    before_action :set_enrollment, only: :destroy

    def index
      enrollments = @class_group.class_enrollments
      enrollments = enrollments.active unless params[:include_canceled].to_s == "true"
      records, meta = paginate(enrollments.order_by(enrolled_at: :desc), per_page: Paginated::MAX_PER_PAGE)

      render json: {
        enrollments: ClassEnrollmentSerializer.many(records),
        activeCount: @class_group.active_enrollment_count,
        maxStudents: @class_group.max_students,
        meta: meta
      }
    end

    def create
      chat = Chat.scoped(current_organization.id, params.require(:chat_id).to_s)
      return render_not_found unless chat

      if @class_group.active_enrollment_count >= @class_group.max_students.to_i
        return render_error(status: :unprocessable_entity, code: "classGroupFull", message: t("agenda.errors.class_group_full"))
      end

      enrollment = @class_group.class_enrollments.new(chat: chat, organization_id: current_organization.id)

      if enrollment.save
        render json: ClassEnrollmentSerializer.one(enrollment), status: :created
      else
        render_invalid(enrollment)
      end
    end

    # Cancela todas as inscrições ativas do mesmo contato nesta turma.
    def destroy
      enrollments = @class_group.class_enrollments.active.where(chat_id: @enrollment.chat_id)
      slots = enrollments.map { |item| { day_of_week: item.schedule_day_of_week, window_start: item.schedule_window_start } }

      enrollments.update_all(status: "canceled")
      slots.uniq.each { |slot| SessionSlot.broadcast_enrollment(@class_group, slot) }

      head :no_content
    end

    private

    def set_enrollment
      @enrollment = @class_group.class_enrollments.where(id: params[:id]).take
      render_not_found unless @enrollment
    end
  end
end
