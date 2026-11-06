module Agenda
  # A presença em uma aula, gravada ou calculada. Marcar presença em aula calculada materializa o
  # documento, e quem está inscrito sem registro aparece com id `ve_<inscrição>` até ser marcado.
  class ClassAttendancesController < BaseController
    before_action :set_slot

    def index
      render json: { attendances: @slot.attendees }
    end

    def update
      session = @slot.materialize!
      attendance = find_attendance(session)
      return render_not_found unless attendance

      attendance.assign_attributes(attendance_status: status_param, checked_at: Time.current, checked_by: current_account.name)

      if attendance.save
        @slot.broadcast_attendance
        render json: ClassAttendanceSerializer.one(attendance)
      else
        render_invalid(attendance)
      end
    end

    # `enrollAll: true` inscreve nos horários de `slots` (sem eles, no horário desta aula). Sem isso,
    # o contato entra como convidado só nesta aula.
    def create
      chat = Chat.scoped(current_organization.id, params.require(:chat_id).to_s)
      return render_not_found unless chat

      ActiveModel::Type::Boolean.new.cast(params[:enroll_all]) ? enroll(chat) : add_guest(chat)
    end

    def destroy
      attendance = @slot.session&.class_attendances&.where(id: params[:id])&.take
      return render_not_found unless attendance

      attendance.destroy!
      @slot.broadcast_attendance

      head :no_content
    end

    # As janelas da grade, para a tela perguntar em quais horários inscrever.
    def schedule
      current = @slot.slot
      windows = Array(@slot.class_group.schedule).select { |day| day["enabled"] }.flat_map do |day|
        Array(day["windows"]).map do |window|
          {
            dayOfWeek: day["day_of_week"],
            windowStart: window["start"],
            windowEnd: window["end"],
            current: day["day_of_week"] == current[:day_of_week] && window["start"] == current[:window_start]
          }
        end
      end

      render json: { windows: windows }
    end

    def bulk_update
      status = status_param
      unless status.nil? || ClassAttendance::STATUSES.include?(status)
        return render_error(status: :unprocessable_entity, code: "invalidAttendanceStatus", field: "attendanceStatus", message: t("agenda.errors.invalid_attendance_status"))
      end

      session = @slot.materialize!
      @slot.enrollments.each do |enrollment|
        session.class_attendances
               .find_or_initialize_by(class_enrollment_id: enrollment.id, chat_id: enrollment.chat_id)
               .update!(attendance_status: status, checked_at: Time.current, checked_by: current_account.name)
      end
      @slot.broadcast_attendance

      render json: { attendanceSummary: session.attendance_summary }
    end

    private

    def set_slot
      @slot = SessionSlot.resolve(current_organization.id, params[:class_session_id])
      render_not_found unless @slot
    end

    def status_param
      params[:attendance_status].presence
    end

    def find_attendance(session)
      id = params[:id].to_s
      return session.class_attendances.where(id: id).take unless id.start_with?(SessionSlot::PENDING_PREFIX)

      enrollment = @slot.class_group.class_enrollments.active.where(id: id.delete_prefix(SessionSlot::PENDING_PREFIX)).take
      enrollment && session.class_attendances.find_or_initialize_by(class_enrollment_id: enrollment.id, chat_id: enrollment.chat_id)
    end

    def add_guest(chat)
      session = @slot.materialize!
      if session.class_attendances.where(chat_id: chat.id).exists?
        return render_error(status: :unprocessable_entity, code: "alreadyInSession", message: t("agenda.errors.already_in_session"))
      end

      attendance = session.class_attendances.create!(chat: chat, guest: true, checked_by: current_account.name)
      @slot.broadcast_attendance

      render json: ClassAttendanceSerializer.one(attendance), status: :created
    end

    # Reativa a inscrição cancelada, em vez de criar outra.
    def enroll(chat)
      slots = requested_slots
      unless slots.all? { |slot| @slot.class_group.window_at(slot[:day_of_week], slot[:window_start]) }
        return render_error(status: :unprocessable_entity, code: "invalidSlot", field: "slots", message: t("agenda.errors.invalid_slot"))
      end

      created = slots.count { |slot| enroll_in_slot(chat, slot) }
      slots.each { |slot| SessionSlot.broadcast_enrollment(@slot.class_group, slot) } if created.positive?

      render json: { enrolledAll: true, enrollmentsCreated: created }, status: :created
    end

    def enroll_in_slot(chat, slot)
      enrollment = @slot.class_group.class_enrollments.find_or_initialize_by(
        chat_id: chat.id, schedule_day_of_week: slot[:day_of_week], schedule_window_start: slot[:window_start]
      )
      return false if enrollment.persisted? && enrollment.active?

      enrollment.status = "active"
      enrollment.organization_id = current_organization.id
      enrollment.save!
      true
    end

    def requested_slots
      slots = params[:slots]
      return [ @slot.slot ] unless slots.is_a?(Array) && slots.any?

      # O que não for um objeto vira um horário que a grade não tem, e cai no 422 de quem chamou.
      slots.map { |slot| slot.respond_to?(:permit) ? { day_of_week: slot[:day_of_week].to_i, window_start: slot[:window_start].to_s } : {} }
    end
  end
end
