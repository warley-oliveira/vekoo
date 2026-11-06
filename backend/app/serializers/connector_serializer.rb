# O conector como a tela enxerga. Nunca sai token, chave ou segredo de provedor.
class ConnectorSerializer < ApplicationSerializer
  def self.one(connector)
    {
      id: connector.id.to_s,
      type: connector.connector_type,
      name: connector.display_name,
      status: connector.status_name,
      active: connector.active?,
      sendCollaboratorName: connector.send_collaborator_name,
      createdAt: epoch_ms(connector.created_at)
    }.merge(details(connector))
  end

  # Na resposta da criação vai também o que a pessoa cola no painel do provedor ao
  # configurar o webhook. Não sai na listagem, que qualquer conta da organização lê.
  def self.created(connector)
    one(connector).merge(webhook(connector))
  end

  def self.webhook(connector)
    case connector
    when Connector::WhatsappCloud
      { webhookUrl: connector.inbound_url(:whatsapp_cloud, connector.id), verificationToken: connector.verification_token }
    when Connector::InstagramDirect, Connector::FacebookMessenger
      { webhookUrl: connector.inbound_url(:meta_messaging), verificationToken: connector.verification_token }
    when Connector::LeadChat
      { webhookUrl: connector.webhook_url, verificationToken: connector.verification_token }
    else
      {}
    end
  end

  def self.details(connector)
    case connector
    when Connector::WhatsappCloud then whatsapp_cloud(connector)
    when Connector::WhatsappWeb then whatsapp_web(connector)
    when Connector::Zapi then zapi(connector)
    when Connector::InstagramDirect then instagram(connector)
    when Connector::FacebookMessenger then messenger(connector)
    when Connector::LeadChat then lead_chat(connector)
    when Connector::WebWidget then web_widget(connector)
    else {}
    end
  end

  def self.whatsapp_cloud(connector)
    {
      errorMessage: connector.error_message,
      profileName: connector.verified_name,
      fbStatus: connector.fb_status,
      qualityRating: connector.quality_rating,
      businessId: connector.business_id&.to_s,
      wabaId: connector.waba_id&.to_s,
      phoneNumberId: connector.phone_number_id&.to_s,
      displayPhoneNumber: connector.display_phone_number,
      phoneNumberDetails: camelize_keys(connector.phone_number_details),
      phoneNumberList: phone_numbers(connector)
    }
  end

  # Os campos são escolhidos por nós (`fetch_registered_numbers`, `refresh_details`): não são
  # mapa livre e saem em camelCase, como o resto da API. No banco ficam em snake_case.
  def self.phone_numbers(connector)
    connector.phone_number_list.map { |phone| camelize_keys(phone) }
  end

  def self.camelize_keys(hash)
    hash.deep_transform_keys { |key| key.to_s.camelize(:lower) }
  end

  def self.whatsapp_web(connector)
    {
      providerApi: connector.provider_api,
      profileName: connector.profile_name,
      profilePictureUrl: connector.profile_picture_url,
      numberId: connector.number_id,
      numberFormatted: connector.number_formated,
      reactionsSupported: connector.evolution_provider?,
      deleteForEveryoneSupported: connector.zapi_provider?
    }
  end

  def self.zapi(connector)
    {
      instanceId: connector.instance_id,
      profileName: connector.profile_name,
      profilePictureUrl: connector.profile_picture_url,
      numberFormatted: connector.number_formated
    }
  end

  def self.instagram(connector)
    {
      errorMessage: connector.error_message,
      accountName: connector.account_name,
      profileName: connector.instagram_username,
      profilePictureUrl: connector.profile_picture_url,
      instagramAccountId: connector.instagram_account_id,
      instagramUsername: connector.instagram_username,
      biography: connector.biography,
      followersCount: connector.followers_count,
      followsCount: connector.follows_count,
      mediaCount: connector.media_count,
      website: connector.website,
      accountType: connector.account_type,
      authProvider: connector.auth_provider,
      linkedMessengerConnectorId: connector.linked_messenger_connector_id
    }
  end

  def self.messenger(connector)
    {
      errorMessage: connector.error_message,
      profileName: connector.page_name,
      profilePictureUrl: connector.profile_picture_url,
      pageId: connector.page_id,
      pageUrl: connector.page_url,
      linkedInstagramConnectorId: connector.linked_instagram_connector_id
    }
  end

  def self.lead_chat(connector)
    {
      phoneNumberId: connector.phone_number_id&.to_s
    }
  end

  # Só o que é seguro de mostrar. A configuração completa, com token público e snippet,
  # sai em WidgetConnectorSerializer.
  def self.web_widget(connector)
    {
      botDisplayName: connector.bot_display_name,
      botAvatarUrl: connector.bot_avatar_url,
      primaryColor: connector.primary_color,
      position: connector.position,
      welcomeMessage: connector.welcome_message,
      allowedOrigins: connector.allowed_origins,
      launcherIcon: connector.launcher_icon,
      locale: connector.locale
    }
  end
end
