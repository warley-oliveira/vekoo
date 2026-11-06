# A organização da sessão. Ler é aberto a qualquer sessão: o fuso e as preferências do
# chat valem para todo mundo. Editar exige `core_settings`, com uma exceção que vem da
# origem: as preferências do chat ficam na própria tela do chat, ao alcance de quem atende.
# `features` só sai: o que está ligado não se decide pela API.
class OrganizationController < PlatformController
  include ImageUploadable

  require_permission :core_settings, only: %i[update upload_logo destroy_logo]
  require_permission :chat, only: :update_chat_settings

  def show
    render_organization
  end

  def update
    current_organization.update_with_settings!(
      params.permit(:name, :timezone),
      company_info: settings_params[:company_info],
      chat_settings: settings_params[:chat_settings]
    )
    render_organization
  rescue ActiveRecord::RecordInvalid => invalid
    render_invalid(invalid.record)
  end

  def update_chat_settings
    current_organization.update_with_settings!(chat_settings: chat_settings_params)
    render_organization
  rescue ActiveRecord::RecordInvalid => invalid
    render_invalid(invalid.record)
  end

  def upload_logo
    render_organization if attach_image(current_organization.logo)
  end

  def destroy_logo
    current_organization.logo.purge if current_organization.logo.attached?
    render_organization
  end

  private

  def render_organization
    render json: OrganizationSerializer.one(current_organization)
  end

  def settings_params
    @settings_params ||= params.fetch(:settings, {}).permit(
      company_info: %i[business_name cnpj],
      chat_settings: OrganizationRelations::Access::CHAT_SETTINGS_DEFAULTS.keys
    )
  end

  def chat_settings_params
    params.permit(*OrganizationRelations::Access::CHAT_SETTINGS_DEFAULTS.keys)
  end
end
