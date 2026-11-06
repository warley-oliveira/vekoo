# frozen_string_literal: true

class MetaApiClient
  # Graph API query methods.
  #
  # Instance methods use @token and @base_url from the MetaApiClient instance.
  # Module-level (self.*) methods accept explicit credentials and are called as
  # MetaApiClient::Graph.method_name(...) without needing a client instance.
  module Graph
    FACEBOOK_GRAPH_URL = 'https://graph.facebook.com/v22.0'
    INSTAGRAM_GRAPH_URL = 'https://graph.instagram.com/v22.0'

    # -------------------------------------------------------------------------
    # Instance methods
    # -------------------------------------------------------------------------

    # Fetches profile info for a given Instagram account ID.
    # Uses the client's @base_url (Facebook or Instagram Graph) and @token.
    #
    # @param ig_account_id [String] Instagram account ID
    # @return [Hash, nil]
    def fetch_instagram_profile(ig_account_id)
      response = HttpClient.get(
        "#{@base_url}/#{ig_account_id}",
        query: {
          fields: 'username,profile_picture_url,name,biography,followers_count,follows_count,media_count,website,account_type',
          access_token: @token
        }
      )

      return nil unless response.success?

      response.parsed_response
    end

    # Fetches the profile of an Instagram message sender by their IGSID.
    # Always uses Instagram Graph API regardless of the client's base_url.
    #
    # @param sender_id [String] Instagram-scoped sender ID (IGSID)
    # @return [Hash, nil]
    def fetch_instagram_sender_profile(sender_id)
      response = HttpClient.get(
        "#{INSTAGRAM_GRAPH_URL}/#{sender_id}",
        query: { fields: 'name,username,profile_pic', access_token: @token },
        timeout: 15
      )

      return nil unless response.success?

      response.parsed_response
    end

    # -------------------------------------------------------------------------
    # Module-level methods (no client instance required)
    # -------------------------------------------------------------------------

    # Fetches the list of Facebook pages connected to a user access token.
    # Returns the first page's data hash, or nil.
    #
    # @param user_access_token [String]
    # @return [Hash, nil]
    def self.fetch_page_info(user_access_token)
      response = HttpClient.get(
        "#{FACEBOOK_GRAPH_URL}/me/accounts",
        query: { access_token: user_access_token }
      )

      return nil unless response.success?

      response.parsed_response['data'].presence&.first
    end

    # Fetches the Instagram Business Account ID linked to a Facebook page.
    #
    # @param page_id [String] Facebook Page ID
    # @param token   [String] Page access token
    # @return [String, nil] Instagram Business Account ID
    def self.fetch_instagram_account_for_page(page_id, token)
      response = HttpClient.get(
        "#{FACEBOOK_GRAPH_URL}/#{page_id}",
        query: { fields: 'instagram_business_account', access_token: token }
      )

      return nil unless response.success?

      response.parsed_response.dig('instagram_business_account', 'id')
    end

    # Calls GET /me on the Instagram Graph API.
    # Returns both 'id' (app-scoped) and 'user_id' (professional account ID used in webhooks).
    #
    # @param token [String] Instagram user access token
    # @return [Hash, nil]
    def self.fetch_instagram_me(token)
      response = HttpClient.get(
        "#{INSTAGRAM_GRAPH_URL}/me",
        query: {
          fields: 'id,user_id,username,name,profile_picture_url,biography,followers_count,follows_count,media_count,website,account_type',
          access_token: token
        }
      )

      return nil unless response.success?

      response.parsed_response
    end

    # Unsubscribes the connected Instagram account from webhook events.
    # Uses the Instagram Graph API and the user's instagram access token.
    #
    # @param token [String] Instagram user access token
    # @return [Hash] { success: true } | { success: false, error: String }
    def self.unsubscribe_instagram_webhooks(token)
      response = HttpClient.delete(
        "#{INSTAGRAM_GRAPH_URL}/me/subscribed_apps",
        query: { access_token: token }
      )

      Rails.logger.info "[MetaApiClient::Graph.unsubscribe_instagram_webhooks] #{response.code} – #{response.parsed_response}"

      if response.success?
        { success: true }
      else
        error = response.parsed_response.is_a?(Hash) ? response.parsed_response.dig('error', 'message') : nil
        { success: false, error: error || "HTTP #{response.code}" }
      end
    end

    # Revokes ALL permissions previously granted to the app by the Instagram user.
    # After this call, the user will have to re-authorize on their next OAuth flow.
    #
    # @param token [String] Instagram user access token
    # @return [Hash] { success: true } | { success: false, error: String }
    def self.revoke_instagram_permissions(token)
      response = HttpClient.delete(
        "#{INSTAGRAM_GRAPH_URL}/me/permissions",
        query: { access_token: token }
      )

      Rails.logger.info "[MetaApiClient::Graph.revoke_instagram_permissions] #{response.code} – #{response.parsed_response}"

      if response.success?
        { success: true }
      else
        error = response.parsed_response.is_a?(Hash) ? response.parsed_response.dig('error', 'message') : nil
        { success: false, error: error || "HTTP #{response.code}" }
      end
    end

    # Unsubscribes a Facebook page from webhook events. Used when an Instagram
    # connector was authenticated via Facebook Login (Page-linked).
    #
    # @param page_id [String] Facebook Page ID
    # @param token   [String] Page access token
    # @return [Hash] { success: true } | { success: false, error: String }
    def self.unsubscribe_page_webhooks(page_id, token)
      response = HttpClient.delete(
        "#{FACEBOOK_GRAPH_URL}/#{page_id}/subscribed_apps",
        query: { access_token: token }
      )

      Rails.logger.info "[MetaApiClient::Graph.unsubscribe_page_webhooks] #{response.code} – #{response.parsed_response}"

      if response.success?
        { success: true }
      else
        error = response.parsed_response.is_a?(Hash) ? response.parsed_response.dig('error', 'message') : nil
        { success: false, error: error || "HTTP #{response.code}" }
      end
    end

    # Subscribes a Facebook page to webhook events for messaging.
    #
    # @param page_id [String] Facebook Page ID
    # @param token   [String] Page access token
    # @return [Hash] { success: true } | { success: false, error: String }
    def self.subscribe_page_webhooks(page_id, token)
      response = HttpClient.post(
        "#{FACEBOOK_GRAPH_URL}/#{page_id}/subscribed_apps",
        headers: {},
        query: {
          subscribed_fields: 'messages,messaging_postbacks,message_deliveries,message_reads',
          access_token: token
        },
        timeout: 30
      )

      Rails.logger.info "[MetaApiClient::Graph.subscribe_page_webhooks] #{response.code} – #{response.parsed_response}"

      if response.success?
        { success: true }
      else
        error = response.parsed_response&.dig('error', 'message') || 'Unknown error'
        Rails.logger.error "[MetaApiClient::Graph.subscribe_page_webhooks] Error: #{error}"
        { success: false, error: error }
      end
    end
  end
end
