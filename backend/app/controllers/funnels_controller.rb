# Os funis: cadastro e quadro. Origem: `pipeline_controller`, que lia as colunas do assistente. Aqui o
# funil é da organização (`Funnel`), e quem vê o quê passa por `Chat.visible_to`.
class FunnelsController < PlatformController
  include Insights::QueryTimeout

  # `page[<id da etapa>]`: a chave é um UUID, e o `underscore` trocaria os hífens dela.
  self.opaque_params += %w[page]

  require_permission :funnel

  before_action :set_funnel, only: %i[show update destroy board]

  rescue_from Funnels::Save::Refused do |error|
    render_error(status: :unprocessable_content, code: error.code, field: "stages", message: t("insights.funnels.errors.#{error.code.underscore}", count: Funnel::MAX_STAGES))
  end

  # GET /funnels
  def index
    records, meta = paginate(current_organization.funnels.includes(:stages).order(:name, :id), per_page: Paginated::MAX_PER_PAGE)

    render json: { funnels: FunnelSerializer.many(records), meta: meta }
  end

  def show
    render json: { funnel: FunnelSerializer.one(@funnel) }
  end

  def create
    funnel = Funnels::Save.new(current_organization.funnels.new, funnel_attributes, stages: stage_list || []).call

    render json: { funnel: FunnelSerializer.one(funnel) }, status: :created
  end

  def update
    funnel = Funnels::Save.new(@funnel, funnel_attributes, stages: stage_list).call

    render json: { funnel: FunnelSerializer.one(funnel) }
  end

  def destroy
    @funnel.destroy!

    head :no_content
  end

  # GET /funnels/:id/board?dateField=&days=&perColumn=&page[none]=&page[<stageId>]=
  def board
    render json: Funnels::Board.new(
      funnel: @funnel,
      account: current_account,
      date_field: params[:date_field],
      days: params[:days],
      per_column: params[:per_column],
      pages: page_params
    ).call
  end

  private

  def set_funnel
    @funnel = current_organization.funnels.includes(:stages).find(params[:id])
  end

  def funnel_params
    @funnel_params ||= params.require(:funnel).permit(:name, :description, stages: %i[id name])
  end

  def funnel_attributes
    funnel_params.slice(:name, :description).to_h
  end

  def stage_list
    funnel_params.key?(:stages) ? funnel_params[:stages].map(&:to_h) : nil
  end

  def page_params
    page = params[:page]
    page.respond_to?(:to_unsafe_h) ? page.to_unsafe_h : {}
  end
end
