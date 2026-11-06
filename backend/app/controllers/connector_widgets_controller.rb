# Configuração do widget de chat de um site: aparência, regras, tokens e o snippet de
# instalação. O chat em si é a API pública de `Widget::V1`.
class ConnectorWidgetsController < PlatformController
  require_permission :core_settings

  before_action :set_connector

  PERMITTED_ATTRS = %i[
    primary_color position welcome_message bot_avatar_url bot_display_name
    launcher_icon locale rate_limit_per_min pre_chat_fields
    daily_message_cap daily_visitor_cap auto_page_context proactive_enabled
    launcher_image_url launcher_size header_bg_color header_text_color
    user_bubble_color user_bubble_text_color assistant_bubble_color
    assistant_bubble_text_color message_area_bg bubble_radius panel_radius
    font_family custom_css delivery_mode pinned_version
  ].freeze

  IMAGE_SLOTS = { "launcher" => :launcher_image_url, "avatar" => :bot_avatar_url }.freeze
  ALLOWED_IMAGE_TYPES = %w[image/jpeg image/png image/webp image/gif].freeze
  MAX_IMAGE_SIZE = 2.megabytes

  def show
    render_widget
  end

  def update
    attrs = params.permit(*PERMITTED_ATTRS).to_h.symbolize_keys
    attrs[:allowed_origins] = Array(params[:allowed_origins]).grep(String).compact_blank if params.key?(:allowed_origins)

    # CSS livre é semi-confiável (dono autenticado), mas vai para o <style> do widget:
    # higieniza antes de persistir. Ver Widget::CssSanitizer.
    attrs[:custom_css] = ::Widget::CssSanitizer.call(attrs[:custom_css]) if attrs.key?(:custom_css)

    @connector.assign_attributes(attrs)
    apply_active_flag

    if @connector.save
      render_widget
    else
      render_invalid(@connector)
    end
  end

  def destroy
    @connector.deactivate
    render_widget
  end

  def regenerate_token
    @connector.regenerate_credentials!
    render_widget
  end

  # Multipart: file, slot=launcher|avatar. A imagem precisa ser pública, porque o widget a
  # carrega no site do cliente: vai a URL absoluta da rota proxy.
  def upload_image
    field = IMAGE_SLOTS[params[:slot].to_s]
    return render_error(status: :unprocessable_entity, code: "invalidSlot", field: "slot") unless field

    file = params[:file]
    return render_error(status: :unprocessable_entity, code: "fileRequired", field: "file") unless file.respond_to?(:read)
    return render_error(status: :unprocessable_entity, code: "invalidFileType", field: "file") unless ALLOWED_IMAGE_TYPES.include?(file.content_type)
    return render_error(status: :unprocessable_entity, code: "fileTooLarge", field: "file") if file.size > MAX_IMAGE_SIZE

    blob = Media::Storage.store_io(file, filename: file.original_filename.presence || "widget-image", content_type: file.content_type)
    @connector.update!(field => Media::Storage.public_url(Media::Storage.path_for(blob)))

    render_widget
  rescue StandardError => e
    Rails.logger.error("[ConnectorWidgetsController#upload_image] #{e.class}: #{e.message}")
    render_error(status: :unprocessable_entity, code: "uploadFailed")
  end

  private

  def set_connector
    connector = Connector::Base.scoped(current_organization.id, params[:connector_id])
    return render_not_found unless connector
    return render_error(status: :unprocessable_entity, code: "connectorTypeMismatch") unless connector.is_a?(Connector::WebWidget)

    @connector = connector
  end

  def apply_active_flag
    return unless params.key?(:active)

    @connector.status = ActiveModel::Type::Boolean.new.cast(params[:active]) ? :active : :inactive
  end

  def render_widget
    render json: { widget: WidgetConnectorSerializer.one(@connector) }
  end
end
