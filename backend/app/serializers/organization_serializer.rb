class OrganizationSerializer < ApplicationSerializer
  # `plan` sai como **código** (`free`); o rótulo visível vem de `plans.<plan>`
  # na tela — o backend não escreve interface.
  def self.one(organization)
    {
      id: organization.id,
      name: organization.name,
      plan: organization.plan,
      timezone: organization.timezone,
      features: organization.features,
      settings: settings_of(organization),
      logoUrl: StoredImagePath.for(organization.logo, :display),
      internal: organization.internal,
      createdAt: epoch_ms(organization.created_at)
    }
  end

  def self.settings_of(organization)
    {
      companyInfo: {
        businessName: organization.business_name,
        cnpj: organization.cnpj,
        formattedCnpj: organization.formatted_cnpj,
        companyName: organization.company_name,
        validCnpj: organization.valid_cnpj?
      },
      chatSettings: {
        autoRemoveWaitingOperatorTag: organization.auto_remove_waiting_operator_tag,
        reopenConversationOnInboundEnabled: organization.reopen_conversation_on_inbound_enabled
      }
    }
  end
  private_class_method :settings_of
end
