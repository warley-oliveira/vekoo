# Canais de atendimento da organização: criar, conectar, reconectar, pausar, perfil da
# WABA, números e perfil do Instagram. Listar e ver valem para qualquer pessoa da organização
# (o chat e as campanhas precisam saber os canais); o resto é configuração.
class ConnectorsController < PlatformController
  self.opaque_params += %w[websites]

  require_permission :core_settings, except: %i[index show]

  before_action :set_connector, except: %i[index create]
  before_action :require_whatsapp_cloud, only: %i[business_profile update_business_profile upload_profile_picture phone_numbers refresh_phone_numbers]
  before_action :require_instagram, only: :instagram_profile

  PROFILE_PICTURE_TYPES = %w[image/jpeg image/png].freeze

  def index
    records, meta = paginate(
      Connector::Base.where(organization_id: current_organization.id).order_by(created_at: :asc),
      per_page: Paginated::MAX_PER_PAGE
    )

    render json: { connectors: ConnectorSerializer.many(records), meta: meta }
  end

  def show
    qr_code = Rails.cache.read("qrcode.base64.#{@connector.id}")

    render json: { connector: ConnectorSerializer.one(@connector), extras: qr_code ? { qrCode: qr_code } : {} }
  end

  def create
    result = Connectors::Creator.call(organization: current_organization, params: params)

    render json: {
      connector: ConnectorSerializer.created(result.connector),
      instagramConnector: result.instagram && ConnectorSerializer.created(result.instagram)
    }, status: :created
  rescue Connectors::Creator::UnknownType
    render_error(status: :unprocessable_entity, code: "invalidConnectorType", field: "connectorType")
  rescue Mongoid::Errors::Validations
    raise
  rescue StandardError => e
    render_action_failure("create", e)
  end

  def update
    if @connector.update(params.permit(:send_collaborator_name).to_h)
      render_connector
    else
      render_invalid(@connector)
    end
  end

  def activate
    if @connector.paused?
      return render_invalid(@connector) unless @connector.update(status: :active)
    elsif !@connector.active?
      activate_connector
    end

    # O provedor pode recusar sem levantar exceção (o conector fica `failed`, com o motivo) ou
    # nem haver o que tentar (Instagram sem o código da Meta): aí o canal não voltou.
    Connectors::Alerts.reconnected(@connector) if @connector.active? || @connector.pending?
    render_connector
  rescue StandardError => e
    render_action_failure("activate", e)
  end

  def reload
    return render_type_mismatch unless @connector.respond_to?(:reload_instance)

    @connector.reload_instance
    render_connector
  rescue StandardError => e
    render_action_failure("reload", e)
  end

  def shutdown
    return render_type_mismatch unless @connector.respond_to?(:logout_instance)

    @connector.logout_instance
    Connectors::Alerts.disconnected(@connector, message: t("connectors.disconnection.manual_shutdown", name: @connector.display_name))
    render_connector
  rescue StandardError => e
    render_action_failure("shutdown", e)
  end

  def pause
    return render_invalid(@connector) unless @connector.update(status: :paused)

    render_connector
  end

  def disconnect
    @connector.deactivate
    Connectors::Alerts.disconnected(@connector, message: t("connectors.disconnection.manual_disconnect", name: @connector.display_name))
    render_connector
  rescue NotImplementedError # não é StandardError: o canal não tem como desconectar
    render_type_mismatch
  rescue StandardError => e
    render_action_failure("disconnect", e)
  end

  # --- perfil da WABA ---------------------------------------------------------

  def business_profile
    profile = business_profile_api.details(selected_phone_number_id).data
    return render_error(status: :unprocessable_entity, code: "connectorProviderError") if profile.nil?

    render json: {
      businessProfile: {
        about: profile.about,
        address: profile.address,
        description: profile.description,
        email: profile.email,
        profilePictureUrl: profile.profile_picture_url,
        websites: profile.try(:websites) || [],
        vertical: profile.vertical
      }
    }
  rescue StandardError => e
    render_action_failure("business_profile", e)
  end

  def update_business_profile
    result = business_profile_api.update(
      phone_number_id: selected_phone_number_id,
      params: params.permit(:about, :address, :description, :email, :vertical, websites: []).to_h.symbolize_keys
    )
    return render_provider_refusal(result) if result.error?

    @connector.refresh_details(selected_phone_number_id)
    @connector.save!

    render_connector
  rescue WhatsappSdk::Api::BusinessProfile::InvalidVertical => e
    render_error(status: :unprocessable_entity, code: "connectorProviderError", field: "vertical", message: e.message)
  rescue StandardError => e
    render_action_failure("update_business_profile", e)
  end

  def upload_profile_picture
    file = params[:file]
    return render_error(status: :unprocessable_entity, code: "fileRequired", field: "file") unless file.respond_to?(:read)
    return render_error(status: :unprocessable_entity, code: "invalidFileType", field: "file") unless PROFILE_PICTURE_TYPES.include?(file.content_type)

    upload = WhatsappSdk::Api::Medias.new(@connector.whatsapp_client).upload(
      sender_id: selected_phone_number_id.to_i,
      file_path: file.tempfile.path,
      type: file.content_type
    )
    return render_error(status: :unprocessable_entity, code: "connectorProviderError") unless upload&.data&.id

    result = business_profile_api.update(
      phone_number_id: selected_phone_number_id.to_i,
      params: { profile_picture_handle: upload.data.id }
    )
    return render_provider_refusal(result) if result.error?

    render json: { mediaId: upload.data.id }
  rescue StandardError => e
    render_action_failure("upload_profile_picture", e)
  end

  def phone_numbers
    render_phone_numbers
  end

  def refresh_phone_numbers
    @connector.fetch_registered_numbers!

    render_phone_numbers
  rescue StandardError => e
    render_action_failure("refresh_phone_numbers", e)
  end

  # --- perfil do Instagram ----------------------------------------------------

  # Falhou ao atualizar: devolve o que está guardado e diz por quê.
  def instagram_profile
    @connector.refresh_profile!

    render_connector
  rescue StandardError => e
    Rails.logger.error("[ConnectorsController#instagram_profile] #{e.message}")
    render json: { connector: ConnectorSerializer.one(@connector), refreshError: e.message }
  end

  private

  def set_connector
    @connector = Connector::Base.scoped(current_organization.id, params[:id])
    render_not_found unless @connector
  end

  def require_whatsapp_cloud
    render_type_mismatch unless @connector.is_a?(Connector::WhatsappCloud)
  end

  def require_instagram
    render_type_mismatch unless @connector.is_a?(Connector::InstagramDirect)
  end

  def render_connector
    render json: { connector: ConnectorSerializer.one(@connector) }
  end

  def render_type_mismatch
    render_error(status: :unprocessable_entity, code: "connectorTypeMismatch")
  end

  def render_action_failure(action, error)
    Rails.logger.error("[ConnectorsController##{action}] #{error.class}: #{error.message}")
    render_error(status: :unprocessable_entity, code: "connectorActionFailed")
  end

  # O SDK da Meta não levanta exceção quando ela recusa: o erro vem na resposta.
  def render_provider_refusal(response)
    render_error(status: :unprocessable_entity, code: "connectorProviderError", message: response.error.message)
  end

  def render_phone_numbers
    render json: {
      phoneNumbers: ConnectorSerializer.phone_numbers(@connector),
      primaryPhoneNumberId: @connector.phone_number_id&.to_s
    }
  end

  # O código de autorização da Meta, quando o canal precisa dele.
  def activate_connector
    if @connector.method(:activate).arity.zero?
      @connector.activate
    else
      @connector.activate(params[:code])
    end
  end

  def selected_phone_number_id
    params[:phone_number_id].presence || @connector.phone_number_id
  end

  def business_profile_api
    WhatsappSdk::Api::BusinessProfile.new(@connector.whatsapp_client)
  end
end
