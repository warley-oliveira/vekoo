# Modelos de mensagem da WABA. A Meta é a fonte da verdade: a listagem sincroniza antes de
# responder, e uma falha lá não derruba a tela, que recebe o que já está guardado.
class ConnectorTemplatesController < PlatformController
  require_permission :core_settings, except: :index

  before_action :set_connector
  before_action :set_template, only: %i[update destroy]

  def index
    begin
      @connector.sync_templates
    rescue StandardError => e
      Rails.logger.error("[ConnectorTemplatesController#index] Falha ao sincronizar: #{e.message}")
    end

    # Modelos removidos da WABA continuam no banco (campanhas guardam o id), mas não são
    # oferecidos para envio.
    include_removed = ActiveModel::Type::Boolean.new.cast(params[:include_removed])
    scope = include_removed ? @connector.whatsapp_templates : @connector.whatsapp_templates.available

    render json: { templates: WhatsappTemplateSerializer.many(scope.order_by(name: :asc)) }
  end

  def create
    template = @connector.whatsapp_templates.build(template_params.merge(sync_update: true))

    if template.save
      render json: { template: WhatsappTemplateSerializer.one(template) }, status: :created
    else
      render_invalid(template)
    end
  rescue StandardError => e
    render_provider_failure("create", e)
  end

  def update
    @template.sync_update = true

    if @template.update(template_params)
      render json: { template: WhatsappTemplateSerializer.one(@template) }
    else
      render_invalid(@template)
    end
  rescue StandardError => e
    render_provider_failure("update", e)
  end

  def destroy
    business_id = @connector.waba_id.present? ? @connector.waba_id : @connector.business_id
    result = @connector.templates_obj.delete(business_id: business_id, name: @template.name, hsm_id: @template.template_id)

    if result.error.present?
      details = result.error.raw_data_response
      Rails.logger.error("[ConnectorTemplatesController#destroy] #{details}")
      return render_error(status: :unprocessable_entity, code: "connectorProviderError", message: details["error_user_msg"] || details["message"])
    end

    @template.destroy!
    head :no_content
  rescue StandardError => e
    render_provider_failure("destroy", e)
  end

  private

  def set_connector
    connector = Connector::Base.scoped(current_organization.id, params[:connector_id])
    return render_not_found unless connector
    return render_error(status: :unprocessable_entity, code: "connectorTypeMismatch") unless connector.is_a?(Connector::WhatsappCloud)

    @connector = connector
  end

  def set_template
    @template = @connector.whatsapp_templates.where(id: params[:id]).take
    render_error(status: :not_found, code: "templateNotFound") unless @template
  end

  def template_params
    permitted = params.permit(:name, :category, :language).to_h
    if params.key?(:components)
      components = params[:components]
      permitted[:components] = JSON.parse(components.to_json)
    end
    permitted
  end

  def render_provider_failure(action, error)
    Rails.logger.error("[ConnectorTemplatesController##{action}] #{error.class}: #{error.message}")
    render_error(status: :unprocessable_entity, code: "connectorProviderError", message: error.message)
  end
end
