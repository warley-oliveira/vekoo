# O catálogo de ferramentas para instalar, igual para toda organização. Só leitura: o CRUD era o painel interno da origem.
class ToolCatalogController < PlatformController
  require_permission :flows

  # GET /tool-catalog?category=
  def index
    scope = Tool.active.order_by(name: :asc)
    scope = scope.where(category: params[:category]) if params[:category].present?

    render json: { tools: ToolSerializer.many(scope) }
  end

  def show
    tool = Tool.active.where(id: params[:id]).take
    return render_not_found unless tool

    render json: { tool: ToolSerializer.full(tool) }
  end
end
