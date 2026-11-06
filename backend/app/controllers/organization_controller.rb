# A organização da sessão. Ler é aberto a qualquer sessão: o fuso e as preferências do
# chat valem para todo mundo. Editar exige `core_settings`, com uma exceção que vem da
# origem: as preferências do chat ficam na própria tela do chat, ao alcance de quem atende.
# `features` só sai: o que está ligado não se decide pela API.
class OrganizationController < PlatformController
  include ImageUploadable

  CHAT_SETTINGS = OrganizationRelations::Access::CHAT_SETTINGS_DEFAULTS.keys.freeze

  require_permission :core_settings, only: %i[update upload_logo destroy_logo]
  require_permission :chat, only: :update_chat_settings

  def show
    render_organization
  end

  # { organization: { name, timezone, settings: { companyInfo, chatSettings } } }
  def update
    fields = params.expect(
      organization: [ :name, :timezone, { settings: { company_info: %i[business_name cnpj], chat_settings: CHAT_SETTINGS } } ]
    )

    current_organization.update_with_settings!(
      fields.slice(:name, :timezone),
      company_info: fields.dig(:settings, :company_info),
      chat_settings: fields.dig(:settings, :chat_settings)
    )
    render_organization
  rescue ActiveRecord::RecordInvalid => invalid
    render_invalid(invalid.record)
  end

  # { chatSettings: { autoRemoveWaitingOperatorTag, reopenConversationOnInboundEnabled } }
  def update_chat_settings
    current_organization.update_with_settings!(chat_settings: params.expect(chat_settings: CHAT_SETTINGS))
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
end
