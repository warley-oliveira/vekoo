class Connector::FacebookMessenger < Connector::Base
  include MetaMessagingConcern

  field :page_url, type: String
  field :linked_instagram_connector_id, type: String

  after_initialize do
    self.auth_provider = "facebook_login" if auth_provider.blank?
  end

  def instance_name
    page_name.presence || super
  end

  def activate(code)
    # Exchange OAuth code for user access token
    result = exchange_facebook_oauth_code(code: code)
    unless result[:success]
      self.error_message = result[:error]
      Rails.logger.error "[FacebookMessenger#activate] OAuth exchange failed: #{error_message}"
      failed! && save!
      return
    end

    user_token = result[:access_token]

    # Get Page info (first page the user manages)
    page_info = fetch_page_info(user_token)
    unless page_info
      self.error_message = "No Facebook Pages found for this account"
      Rails.logger.error "[FacebookMessenger#activate] #{error_message}"
      failed! && save!
      return
    end

    self.page_id = page_info["id"]
    self.page_name = page_info["name"]
    self.page_access_token = page_info["access_token"]

    # Get page profile picture
    pic_response = HTTParty.get(
      "#{FACEBOOK_GRAPH_URL}/#{page_id}/picture",
      query: { redirect: false, type: "large" },
      timeout: 15
    )
    self.profile_picture_url = pic_response.parsed_response.dig("data", "url") if pic_response.success?

    # Subscribe to webhooks
    sub_result = subscribe_page_webhooks!(page_id, page_access_token)
    unless sub_result[:success]
      self.error_message = "Webhook subscription failed: #{sub_result[:error]}"
      Rails.logger.error "[FacebookMessenger#activate] #{error_message}"
      failed! && save!
      return
    end

    active!
    save!
  rescue StandardError => e
    self.error_message = e.message
    Rails.logger.error "[FacebookMessenger#activate] Error: #{e.full_message}"
    failed! && save!
  end

  def deactivate
    inactive!
    save!
  end
end
