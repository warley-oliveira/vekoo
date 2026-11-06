# Os alertas da organização. Os badges e os detalhes são abertos a qualquer sessão, como
# na origem, porque o menu é de todo mundo. Resolver exige `core_settings`: na origem o
# botão só existe nas telas de integrações e webhooks, que são de configuração, e quem não
# chega nelas não deveria poder calar um alerta pela API.
class OrganizationAlertsController < PlatformController
  require_permission :core_settings, only: :resolve

  # GET /alerts — leve o bastante para o menu: { badges: { "connectors" => 2 } }
  def index
    render json: { badges: badges }
  end

  # GET /alerts/details?category=
  def details
    scope = current_organization.organization_alerts.active.order(created_at: :desc)
    scope = scope.for_category(params[:category].to_s) if params[:category].present?
    records, meta = paginate(scope, per_page: Paginated::MAX_PER_PAGE)

    render json: { alerts: OrganizationAlertSerializer.many(records), meta: meta }
  end

  # POST /alerts/resolve { originType, originId, code? } — sem `code`, resolve tudo que
  # vier daquela origem.
  def resolve
    resolved = OrganizationAlert.resolve!(
      current_organization,
      origin_type: params.require(:origin_type).to_s,
      origin_id: params.require(:origin_id).to_s,
      code: params[:code].presence&.to_s
    )

    render json: { resolved: resolved, badges: badges }
  end

  private

  def badges
    OrganizationAlert.active_counts_by_category(current_organization)
  end
end
