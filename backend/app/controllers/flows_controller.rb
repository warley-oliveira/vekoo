# Os fluxos da organização. A definição (blocos e conexões) mora em versões: há sempre um rascunho, e publicar congela o rascunho
# e abre o próximo. O que o editor grava passa intacto: `definition` é um mapa livre (ver CamelParams::DEFAULT_OPAQUE).
class FlowsController < PlatformController
  require_permission :flows

  before_action :set_flow, only: %i[show update update_definition publish archive unarchive destroy versions version]

  # GET /flows?status=&triggerType=&q=
  def index
    scope = Flow.for_organization(current_organization.id).order(updated_at: :desc)
    scope = scope.where(status: params[:status]) if params[:status].present?
    scope = scope.where(trigger_type: params[:trigger_type]) if params[:trigger_type].present?
    scope = scope.where("name ILIKE ?", "%#{Flow.sanitize_sql_like(params[:q])}%") if params[:q].present?

    records, meta = paginate(scope)
    list = records.to_a
    stats = Flows::ListStats.for(list.map(&:id))
    render json: { flows: list.map { |flow| FlowSerializer.one(flow).merge(stats: stats[flow.id]) }, meta: meta }
  end

  def show
    render json: { flow: FlowSerializer.full(@flow) }
  end

  # POST /flows { flow: { name, description?, triggerType?, connectorFilter? }, template? }
  def create
    template = params[:template].present? ? FlowTemplate.find(params[:template]) : nil
    return render_not_found if params[:template].present? && template.nil?

    flow = Flow.new(flow_params.merge(organization_id: current_organization.id, created_by_account_id: current_account.id, status: "draft"))
    flow.trigger_type ||= template&.trigger_type.presence || "manual"

    Flow.transaction do
      flow.save!
      flow.versions.create!(
        version_number: 1,
        definition: template&.definition || blank_definition(flow.trigger_type),
        created_by_account_id: current_account.id
      )
    end

    render json: { flow: FlowSerializer.full(flow.reload) }, status: :created
  end

  def update
    @flow.update!(flow_params)
    render json: { flow: FlowSerializer.one(@flow) }
  end

  # PUT /flows/:id/definition { definition }. Vale para o rascunho: a versão publicada não muda.
  def update_definition
    draft = @flow.draft_version || @flow.versions.create!(
      version_number: (@flow.versions.maximum(:version_number) || 0) + 1,
      definition: blank_definition(@flow.trigger_type),
      created_by_account_id: current_account.id
    )
    definition = params.require(:definition)
    draft.update!(definition: definition.respond_to?(:to_unsafe_h) ? definition.to_unsafe_h : definition)

    render json: { version: FlowSerializer.version(draft) }
  end

  # O rascunho precisa fazer sentido para o motor: nada de bloco desconhecido ou conexão para o vazio.
  def publish
    draft = @flow.draft_version
    return render_error(status: :unprocessable_entity, code: "noDraftToPublish") unless draft

    issues = FlowRuntime::DefinitionValidator.new(draft).issues
    return render_invalid_definition(issues) if issues.any?

    @flow.publish!(version: draft, account: current_account)
    OrganizationAlertService.flow_resolved(current_organization, @flow)

    render json: { flow: FlowSerializer.full(@flow.reload) }
  end

  # O que estava em andamento para: um fluxo arquivado não continua falando com ninguém.
  def archive
    @flow.update!(status: "archived")
    Flows::CancelActive.for_flow(@flow)

    render json: { flow: FlowSerializer.one(@flow) }
  end

  # Liga de novo o que foi arquivado, na mesma versão publicada: o rascunho que estiver aberto continua sendo rascunho.
  def unarchive
    @flow.update!(status: @flow.published_version_id? ? "published" : "draft") if @flow.archived?

    render json: { flow: FlowSerializer.one(@flow) }
  end

  def destroy
    @flow.destroy!
    head :no_content
  end

  # GET /flows/:id/versions. As publicadas e o rascunho, sem a definição: a lista só serve para escolher.
  def versions
    records, meta = paginate(@flow.versions)
    render json: { versions: records.map { |version| FlowSerializer.version_summary(version) }, meta: meta }
  end

  # GET /flows/:id/versions/:version_id. Com a definição, para abrir ou restaurar.
  def version
    render json: { version: FlowSerializer.version(@flow.versions.find(params[:version_id])) }
  end

  private

  def set_flow
    @flow = Flow.for_organization(current_organization.id).find(params[:id])
  end

  def flow_params
    params.require(:flow).permit(:name, :description, :trigger_type, connector_filter: [ { connector_ids: [] } ])
  end

  def blank_definition(trigger_type)
    {
      "nodes" => [
        {
          "id" => "start",
          "type" => "trigger_#{Flow::TRIGGER_TYPES.include?(trigger_type) ? trigger_type : 'manual'}",
          "position" => { "x" => 320, "y" => 200 },
          "data" => { "label" => t("automation.flows.defaults.start") }
        }
      ],
      "edges" => [],
      "viewport" => { "x" => 0, "y" => 0, "zoom" => 1 }
    }
  end

  def render_invalid_definition(issues)
    render_error(
      status: :unprocessable_entity,
      code: "invalidDefinition",
      message: t("automation.flows.errors.invalid_definition"),
      details: { issues: issues.map(&:to_h) }
    )
  end
end
