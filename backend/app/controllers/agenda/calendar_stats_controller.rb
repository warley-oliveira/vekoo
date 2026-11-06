module Agenda
  # O bloco do calendário no dashboard. Vale para quem vê o dashboard ou o calendário: a origem não
  # conferia permissão nenhuma aqui, e a tela do dashboard é quem consome.
  class CalendarStatsController < PlatformController
    before_action { render_forbidden unless current_account.can?(:dashboard) || current_account.can?(:calendar) }

    rescue_from TimeInput::Invalid do
      render_error(status: :unprocessable_entity, code: "invalidTime", message: t("agenda.errors.invalid_time"))
    end

    def show
      render json: CalendarStats.new(current_organization, date_start: params[:date_start], date_end: params[:date_end]).call
    end
  end
end
