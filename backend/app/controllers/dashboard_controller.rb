# O dashboard da organização. O bloco do calendário (`/dashboard/calendar-stats`) é do domínio agenda.
class DashboardController < PlatformController
  include Insights::QueryTimeout

  require_permission :dashboard

  rescue_from Agenda::TimeInput::Invalid do
    render_error(status: :unprocessable_content, code: "invalidTime", message: t("insights.dashboard.errors.invalid_time"))
  end

  rescue_from Insights::DashboardReport::InvalidRange do
    render_error(status: :unprocessable_content, code: "invalidRange", message: t("insights.dashboard.errors.invalid_range"))
  end

  rescue_from Insights::DashboardReport::RangeTooLong do
    render_error(status: :unprocessable_content, code: "rangeTooLong", message: t("insights.dashboard.errors.range_too_long"))
  end

  # GET /dashboard?dateStart=&dateEnd=
  def show
    render json: Insights::DashboardReport.new(current_account, date_start: params[:date_start], date_end: params[:date_end]).call
  end
end
