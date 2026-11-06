# As funções da organização: as escritas aqui e as que vieram de uma ferramenta instalada. É daqui que os blocos escolhem
# (`ai_assistant.tool_ids`, `execute_tool.tool_id`). Origem: WorkspaceToolsController e FunctionActionsController, um por
# workspace e outro por assistente, que aqui são a mesma coisa.
class ToolsController < PlatformController
  # 60 s de JavaScript por vez, por conta. Quem testa de verdade não chega perto.
  TEST_RUNS_PER_MINUTE = 20

  require_permission :flows

  rate_limit to: TEST_RUNS_PER_MINUTE, within: 1.minute, only: :test,
             by: -> { current_account.id }, with: -> { render_too_many_requests }

  before_action :set_tool, only: %i[show update destroy test test_run personalize]
  before_action :ensure_not_locked, only: %i[update destroy]

  # GET /tools?q=&summary=true
  def index
    scope = ToolFunction::MiniRacer.for_organization(current_organization.id).order_by(name: :asc)
    scope = scope.where(name: /#{Regexp.escape(params[:q].to_s)}/i) if params[:q].present?

    records, meta = paginate(scope)
    list = records.to_a
    render json: { tools: ToolFunctionSerializer.many(list, tools: Tools::FunctionListSerializer.preload_tools(list)), meta: meta }
  end

  def show
    render json: { tool: ToolFunctionSerializer.one(@tool) }
  end

  def create
    tool = ToolFunction::MiniRacer.new(tool_params.merge(organization_id: current_organization.id.to_s))
    return render_invalid(tool) unless tool.save

    render json: { tool: ToolFunctionSerializer.one(tool) }, status: :created
  end

  def update
    return render_invalid(@tool) unless @tool.update(tool_params)

    render json: { tool: ToolFunctionSerializer.one(@tool) }
  end

  def destroy
    @tool.destroy
    head :no_content
  end

  # Desvincula da ferramenta instalada: a função vira personalizada, com o código à mostra e editável.
  def personalize
    return render_error(status: :unprocessable_entity, code: "alreadyPersonalized") unless @tool.installed?

    @tool.update!(tool_installation_id: nil)
    render json: { tool: ToolFunctionSerializer.one(@tool) }
  end

  # POST /tools/:id/test { args, chatId? }. Script não roda na thread do Puma: responde 202 com o id, e a tela consulta
  # `GET /tools/:id/test-runs/:runId`.
  def test
    chat_id = params[:chat_id].presence
    return render_not_found if chat_id && !Chat.visible_to(current_account).where(id: chat_id.to_s).exists?

    run_id = Tools::TestRuns.start(current_organization.id, @tool.id.to_s)
    Tools::TestRunJob.perform_later(current_organization.id.to_s, @tool.id.to_s, run_id, args_param, chat_id&.to_s)

    render json: { testRun: { id: run_id, status: "pending" } }, status: :accepted
  end

  def test_run
    run = Tools::TestRuns.read(current_organization.id, @tool.id.to_s, params[:run_id])
    return render_not_found unless run

    render json: { testRun: run.merge("id" => params[:run_id]) }
  end

  private

  def set_tool
    @tool = ToolFunction::MiniRacer.scoped(current_organization.id, params[:id])
    render_not_found unless @tool
  end

  # O código de uma ferramenta instalada não se edita: quem quer mudar personaliza, e deixa de receber o que vier do catálogo.
  def ensure_not_locked
    return unless @tool&.installed?

    render_error(status: :forbidden, code: "toolLocked")
  end

  def tool_params
    attributes = params.require(:tool).permit(:name, :description, :js_code).to_h
    list = params.require(:tool)[:parameters]
    attributes[:parameters] = Array(list).map { |item| item.respond_to?(:to_unsafe_h) ? item.to_unsafe_h : item } if list
    attributes
  end

  def args_param
    raw = params[:args]
    raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : {}
  end
end
