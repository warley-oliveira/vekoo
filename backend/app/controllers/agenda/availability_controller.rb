module Agenda
  # Os horários livres de um serviço. A origem só expunha isto ao assistente e aos scripts; aqui a
  # tela do calendário também pode oferecer horário.
  class AvailabilityController < BaseController
    before_action :set_calendar

    def show
      result = BookingService.new(@calendar).available_slots(
        service_name: service&.name.to_s,
        date_start: params.require(:start).to_s,
        date_end: params.require(:end).to_s,
        employee_name: professional&.name
      )

      if result[:error]
        render_error(status: :unprocessable_entity, code: "noAvailability", message: t("agenda.errors.no_availability"))
      else
        render json: {
          professionalId: professional_id(result[:employee_name]),
          professionalName: result[:employee_name],
          serviceName: result[:service_name],
          # O serviço escreve o dia por extenso, em pt-BR, para scripts e modelos. A tela recebe a
          # data, e a mostra no idioma dela.
          slots: result[:available_slots].transform_keys { |day| day.split(", ").last },
          priorityProfessionalName: result[:employee_with_priority],
          fallback: result[:messages].present?
        }
      end
    rescue ArgumentError
      render_error(status: :unprocessable_entity, code: "invalidTime", message: t("agenda.errors.invalid_time"))
    end

    private

    # O escolhido pela distribuição, para a tela poder criar o agendamento com ele.
    def professional_id(name)
      name && @calendar.professionals.where(name: name).take&.id&.to_s
    end

    def service
      @service ||= @calendar.services.where(id: params.require(:service_id).to_s).take || raise(Mongoid::Errors::DocumentNotFound.new(Offering, params[:service_id]))
    end

    def professional
      return nil if params[:professional_id].blank?

      @professional ||= @calendar.professionals.where(id: params[:professional_id].to_s).take || raise(Mongoid::Errors::DocumentNotFound.new(Professional, params[:professional_id]))
    end
  end
end
