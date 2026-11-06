module Agenda
  # Os horários livres de um serviço. A origem só expunha isto ao assistente e aos scripts; aqui a
  # tela do calendário também pode oferecer horário.
  class AvailabilityController < BaseController
    before_action :set_calendar

    def show
      result = BookingService.new(@calendar).available_slots(
        service_name: service&.name.to_s,
        date_start: params.require(:start),
        date_end: params.require(:end),
        employee_name: professional&.name
      )

      if result[:error]
        render_error(status: :unprocessable_entity, code: "noAvailability", message: t("agenda.errors.no_availability"))
      else
        render json: {
          professionalName: result[:employee_name],
          serviceName: result[:service_name],
          slots: result[:available_slots],
          priorityProfessionalName: result[:employee_with_priority],
          fallback: result[:messages].present?
        }
      end
    rescue ArgumentError
      render_error(status: :unprocessable_entity, code: "invalidTime", message: t("agenda.errors.invalid_time"))
    end

    private

    def service
      @service ||= @calendar.services.where(id: params.require(:service_id)).take || raise(Mongoid::Errors::DocumentNotFound.new(Offering, params[:service_id]))
    end

    def professional
      return nil if params[:professional_id].blank?

      @professional ||= @calendar.professionals.where(id: params[:professional_id]).take || raise(Mongoid::Errors::DocumentNotFound.new(Professional, params[:professional_id]))
    end
  end
end
