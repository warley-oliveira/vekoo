class Connector::InstagramDirect < Connector::Base
  include MetaMessagingConcern

  field :instagram_account_id, type: String
  field :instagram_username, type: String
  field :account_name, type: String
  field :biography, type: String
  field :followers_count, type: Integer
  field :follows_count, type: Integer
  field :media_count, type: Integer
  field :website, type: String
  field :account_type, type: String
  field :linked_messenger_connector_id, type: String

  def instance_name
    return "@#{instagram_username}" if instagram_username.present?
    return account_name if account_name.present?
    return page_name if page_name.present?

    super
  end

  # Activate via Facebook Login (Page-linked)
  # Receives the page_access_token and page_id from the linked FacebookMessenger connector
  def activate_via_facebook(fb_page_id:, fb_page_token:)
    self.auth_provider = 'facebook_login'
    self.page_id = fb_page_id
    self.page_access_token = fb_page_token

    # Fetch Instagram Business Account linked to the Page
    ig_account_id = fetch_instagram_account_for_page(fb_page_id, fb_page_token)
    unless ig_account_id
      self.error_message = 'No Instagram Business Account linked to this Facebook Page'
      Rails.logger.error "[InstagramDirect#activate_via_facebook] #{error_message}"
      failed! && save!
      return
    end

    self.instagram_account_id = ig_account_id

    # Fetch Instagram profile info
    profile = fetch_instagram_profile(ig_account_id, fb_page_token)
    apply_profile_fields(profile) if profile

    active!
    save!

    subscribe_to_webhooks
  rescue StandardError => e
    self.error_message = e.message
    Rails.logger.error "[InstagramDirect#activate_via_facebook] Error: #{e.full_message}"
    failed! && save!
  end

  # Activate via Instagram Login (standalone, no Facebook Page)
  def activate_via_instagram(code:, redirect_uri:)
    self.auth_provider = 'instagram_login'

    # Exchange code for long-lived Instagram token
    result = exchange_instagram_oauth_code(code: code, redirect_uri: redirect_uri)
    unless result[:success]
      self.error_message = result[:error]
      Rails.logger.error "[InstagramDirect#activate_via_instagram] Token exchange failed: #{error_message}"
      failed! && save!
      return
    end

    self.instagram_user_access_token = result[:access_token]
    self.instagram_token_expires_at = result[:expires_at]

    resolve_instagram_identity!

    active!
    save!

    subscribe_to_webhooks
  rescue StandardError => e
    self.error_message = e.message
    Rails.logger.error "[InstagramDirect#activate_via_instagram] Error: #{e.full_message}"
    failed! && save!
  end

  # Resolve the real IGSID and profile via /me.
  # Can be called standalone: connector.resolve_instagram_identity!
  def resolve_instagram_identity!
    token = instagram_user_access_token
    raise 'No Instagram user access token available' unless token.present?

    me = fetch_instagram_me(token)
    if me && me['account_id'].present?
      self.instagram_account_id = me['account_id']
      apply_profile_fields(me)
    else
      Rails.logger.warn '[InstagramDirect#resolve_instagram_identity!] /me returned no data, falling back to fetch_instagram_profile'
      profile = fetch_instagram_profile(instagram_account_id, token)
      apply_profile_fields(profile) if profile
    end

    save!
  end

  # Refresh the cached profile fields by re-querying the Graph API.
  # Used by the frontend "account info" modal to expose live data to Meta reviewers.
  def refresh_profile!
    case auth_provider
    when 'instagram_login'
      resolve_instagram_identity!
    when 'facebook_login'
      raise 'No page access token available' unless page_access_token.present?

      profile = fetch_instagram_profile(instagram_account_id, page_access_token)
      raise 'Failed to fetch Instagram profile' unless profile

      apply_profile_fields(profile)
      save!
    else
      raise "Unsupported auth_provider: #{auth_provider.inspect}"
    end

    self
  end

  # Subscribe the Instagram account to receive webhook events (e.g. messages).
  # Can be called standalone for a specific connector.
  def subscribe_to_webhooks(fields: 'messages')
    token = retrieve_current_token
    raise 'No access token available for webhook subscription' unless token.present?

    url = "#{api_base_url}/me/subscribed_apps"
    response = HTTParty.post(url, query: { subscribed_fields: fields, access_token: token })
    parsed = response.parsed_response

    unless response.success? && parsed.is_a?(Hash) && parsed['success']
      error_detail = parsed.is_a?(Hash) ? parsed.dig('error', 'message') : parsed.to_s
      Rails.logger.error "[InstagramDirect#subscribe_to_webhooks] Failed: #{error_detail}"
      return { success: false, error: error_detail }
    end

    Rails.logger.info "[InstagramDirect#subscribe_to_webhooks] Subscribed connector #{id} to #{fields}"
    { success: true }
  end

  def activate(code = nil)
    # Default activation delegates based on auth_provider
    return unless auth_provider == 'instagram_login' && code.present?

    activate_via_instagram(code: code, redirect_uri: nil)
  end

  # Fully disconnect the Instagram connector:
  # 1. Unsubscribe from webhooks on Meta's side (best-effort)
  # 2. Revoke OAuth permissions on Meta's side when using instagram_login (best-effort)
  # 3. Clear cached tokens locally so we cannot impersonate the user anymore
  # 4. Mark the connector as inactive so the UI reflects the disconnected state
  def deactivate
    case auth_provider
    when 'instagram_login'
      revoke_via_instagram_login
    when 'facebook_login'
      revoke_via_facebook_login
    end

    self.instagram_user_access_token = nil
    self.page_access_token = nil
    self.instagram_token_expires_at = nil

    inactive!
    save!
  end

  private

  def revoke_via_instagram_login
    token = instagram_user_access_token
    return if token.blank?

    unsubscribe_result = MetaApiClient::Graph.unsubscribe_instagram_webhooks(token)
    unless unsubscribe_result[:success]
      Rails.logger.warn "[InstagramDirect#deactivate] unsubscribe failed: #{unsubscribe_result[:error]}"
    end

    revoke_result = MetaApiClient::Graph.revoke_instagram_permissions(token)
    return if revoke_result[:success]

    Rails.logger.warn "[InstagramDirect#deactivate] revoke permissions failed: #{revoke_result[:error]}"
  end

  def revoke_via_facebook_login
    token = page_access_token
    return if token.blank? || page_id.blank?

    unsubscribe_result = MetaApiClient::Graph.unsubscribe_page_webhooks(page_id, token)
    return if unsubscribe_result[:success]

    Rails.logger.warn "[InstagramDirect#deactivate] page unsubscribe failed: #{unsubscribe_result[:error]}"
  end

  def apply_profile_fields(data)
    return unless data.is_a?(Hash)

    self.instagram_username = data['username'] if data['username'].present?
    self.account_name       = data['name']     if data['name'].present?
    self.profile_picture_url = data['profile_picture_url'] if data['profile_picture_url'].present?
    self.biography       = data['biography']
    self.followers_count = data['followers_count']
    self.follows_count   = data['follows_count']
    self.media_count     = data['media_count']
    self.website         = data['website']
    self.account_type    = data['account_type']
  end
end
