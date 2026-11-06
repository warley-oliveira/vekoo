# Os modelos de fluxo prontos, iguais para toda organização.
class FlowTemplatesController < PlatformController
  require_permission :flows

  def index
    render json: { flowTemplates: FlowTemplateSerializer.many(FlowTemplate.all) }
  end

  def show
    template = FlowTemplate.find(params[:id])
    return render_not_found unless template

    render json: { flowTemplate: FlowTemplateSerializer.one(template) }
  end
end
