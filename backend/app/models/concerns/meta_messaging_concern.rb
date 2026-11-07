# frozen_string_literal: true

module MetaMessagingConcern
  extend ActiveSupport::Concern

  FACEBOOK_GRAPH_URL = MetaApiClient::FACEBOOK_GRAPH_URL
  INSTAGRAM_GRAPH_URL = MetaApiClient::INSTAGRAM_GRAPH_URL
  FACEBOOK_OAUTH_URL = MetaApiClient::OAuth::FACEBOOK_OAUTH_URL
  INSTAGRAM_OAUTH_URL = MetaApiClient::OAuth::INSTAGRAM_OAUTH_URL
  META_ATTACHMENT_TYPES = { "image" => "image", "video" => "video", "audio" => "audio" }.freeze

  included do
    field :verification_token, type: String
    field :page_id, type: String
    encrypted_field :page_access_token
    encrypted_field :instagram_user_access_token
    field :instagram_token_expires_at, type: Time
    field :page_name, type: String
    field :profile_picture_url, type: String
    field :auth_provider, type: String # 'facebook_login' or 'instagram_login'

    before_create do
      self.verification_token = SecureRandom.base36(32)
    end
  end

  def retrieve_current_token
    case auth_provider
    when "instagram_login"
      instagram_user_access_token
    else
      page_access_token
    end
  end

  def api_base_url
    case auth_provider
    when "instagram_login"
      MetaApiClient::INSTAGRAM_GRAPH_URL
    else
      MetaApiClient::FACEBOOK_GRAPH_URL
    end
  end

  def messaging_endpoint_id
    case auth_provider
    when "instagram_login"
      respond_to?(:instagram_account_id) ? instagram_account_id : page_id
    else
      page_id
    end
  end

  # A Meta devolve o id em `message_id`. Na origem a resposta HTTP inteira ia para
  # `ChatMessage#message_id`, e os webhooks de entrega nunca achavam a mensagem.
  def send_text_message(recipient_id, message, _chat = nil, reply_to_external_id: nil) # rubocop:disable Lint/UnusedMethodArgument
    Rails.logger.info "[MetaMessaging] Sending text message to #{recipient_id}"
    external_message_id(meta_api_client.send_text(recipient_id, message))
  end

  # Aceita a mesma assinatura dos outros conectores (`to, media_dto, chat`) e a forma
  # direta (`to, tipo, url`). Na origem só a direta existia, e quem despachava
  # polimorficamente mandava um DTO como `attachment_type`.
  def send_media_message(recipient_id, media_or_type, media_url_or_chat = nil, _chat = nil)
    if media_or_type.respond_to?(:media_url)
      attachment_type = META_ATTACHMENT_TYPES.fetch(media_or_type.media_type.to_s, "file")
      media_url = media_or_type.media_url
    else
      attachment_type = media_or_type
      media_url = media_url_or_chat
    end

    Rails.logger.info "[MetaMessaging] Sending #{attachment_type} to #{recipient_id}"
    external_message_id(meta_api_client.send_media(recipient_id, attachment_type, media_url))
  end

  def send_audio_message_by_url(recipient_id, audio_url, _chat = nil)
    external_message_id(meta_api_client.send_media(recipient_id, "audio", audio_url))
  end

  def send_typing_indicator(recipient_id)
    meta_api_client.send_typing_indicator(recipient_id)
  end

  def mark_seen(recipient_id)
    meta_api_client.mark_seen(recipient_id)
  end

  # Mesma interface dos outros conectores.
  def mark_read_message(recipient_id, _message_id = nil)
    mark_seen(recipient_id)
  end

  def send_presence(recipient_id, presence)
    send_typing_indicator(recipient_id) if presence.to_s == "composing"
  end

  def download_media(url)
    Rails.logger.info "[MetaMessaging] Downloading media from URL"
    meta_api_client.download_media(url)
  end

  def exchange_facebook_oauth_code(code:)
    MetaApiClient::OAuth.exchange_facebook_code(
      code: code,
      app_id: ENV["META_APP_ID"],
      app_secret: ENV["META_APP_SECRET"]
    )
  end

  def exchange_instagram_oauth_code(code:, redirect_uri:)
    MetaApiClient::OAuth.exchange_instagram_code(
      code: code,
      redirect_uri: redirect_uri,
      app_id: ENV["INSTAGRAM_APP_ID"],
      app_secret: ENV["INSTAGRAM_APP_SECRET"]
    )
  end

  # Refresh the long-lived Instagram token and persist the new value on the record.
  def refresh_instagram_token!
    return false unless auth_provider == "instagram_login"
    return false if instagram_user_access_token.blank?

    result = MetaApiClient::OAuth.refresh_instagram_token(instagram_user_access_token)

    if result[:success]
      self.instagram_user_access_token = result[:access_token]
      self.instagram_token_expires_at  = result[:expires_at]
      self.error_message = nil
      save!
      @meta_api_client = nil # o cliente memoizado ainda guarda o token antigo

      Rails.logger.info "[MetaMessaging] Token refreshed for #{self.class.name} #{id}, expires_at=#{instagram_token_expires_at}"
      true
    else
      Rails.logger.error "[MetaMessaging] Token refresh failed for #{self.class.name} #{id}: #{result[:error]}"
      false
    end
  rescue StandardError => e
    Rails.logger.error "[MetaMessaging] Token refresh error for #{self.class.name} #{id}: #{e.message}"
    false
  end

  def instagram_token_expiring_soon?(days: 7)
    return true if instagram_token_expires_at.blank?

    instagram_token_expires_at < Time.now + days.days
  end

  def fetch_page_info(user_access_token)
    MetaApiClient::Graph.fetch_page_info(user_access_token)
  end

  def fetch_instagram_account_for_page(page_id_param, token)
    MetaApiClient::Graph.fetch_instagram_account_for_page(page_id_param, token)
  end

  def fetch_instagram_profile(ig_account_id, token)
    MetaApiClient.new(
      token: token,
      endpoint_id: ig_account_id,
      base_url: api_base_url
    ).fetch_instagram_profile(ig_account_id)
  end

  def fetch_instagram_me(token)
    MetaApiClient::Graph.fetch_instagram_me(token)
  end

  def fetch_instagram_sender_profile(sender_id)
    return nil if retrieve_current_token.blank?

    meta_api_client.fetch_instagram_sender_profile(sender_id)
  end

  def subscribe_page_webhooks!(page_id_param, token)
    MetaApiClient::Graph.subscribe_page_webhooks(page_id_param, token)
  end

  def display_name
    instance_name
  end

  private

  def external_message_id(response)
    return nil unless response.respond_to?(:success?) && response.success?

    parsed = response.parsed_response
    parsed.is_a?(Hash) ? parsed["message_id"] : nil
  end

  # Memoised MetaApiClient instance built from the current record's credentials.
  # Re-instantiate manually if auth_provider or token changes within a request.
  def meta_api_client
    @meta_api_client ||= MetaApiClient.new(
      token: retrieve_current_token,
      endpoint_id: messaging_endpoint_id,
      base_url: api_base_url
    )
  end
end
