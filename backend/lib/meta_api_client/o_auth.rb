# frozen_string_literal: true

class MetaApiClient
  # Module-level methods for Meta OAuth token exchange and refresh flows.
  # Called as MetaApiClient::OAuth.method_name(...)  – no instance required.
  module OAuth
    FACEBOOK_OAUTH_URL   = 'https://graph.facebook.com/v22.0/oauth/access_token'
    INSTAGRAM_OAUTH_URL  = 'https://api.instagram.com/oauth/access_token'
    INSTAGRAM_GRAPH_URL  = 'https://graph.instagram.com/v22.0'

    # Exchanges a Facebook OAuth authorisation code for a page access token.
    #
    # @param code       [String] The auth code received from Facebook's OAuth flow
    # @param app_id     [String] Facebook App ID
    # @param app_secret [String] Facebook App Secret
    # @return [Hash] { success: true, access_token: String }
    #              | { success: false, error: String }
    def self.exchange_facebook_code(code:, app_id:, app_secret:)
      response = HttpClient.post(
        FACEBOOK_OAUTH_URL,
        headers: { 'Content-Type' => 'application/json' },
        body: {
          client_id: app_id,
          client_secret: app_secret,
          code: code,
          grant_type: 'authorization_code'
        }
      )

      Rails.logger.info "[MetaApiClient::OAuth.exchange_facebook_code] Response: #{response.code}"

      if response.success?
        { success: true, access_token: response.parsed_response['access_token'] }
      else
        error = response.parsed_response&.dig('error', 'message') || 'Unknown error'
        Rails.logger.error "[MetaApiClient::OAuth.exchange_facebook_code] #{response.parsed_response}"
        { success: false, error: error }
      end
    rescue HTTParty::Error, Net::ReadTimeout, Net::OpenTimeout => e
      Rails.logger.error "[MetaApiClient::OAuth.exchange_facebook_code] HTTP error: #{e.message}"
      raise
    end

    # Exchanges an Instagram OAuth authorisation code for a long-lived user access token.
    # The short-lived token is obtained first, then exchanged for a 60-day token.
    #
    # Instagram appends '#_' to the returned code – the method sanitises it automatically.
    #
    # @param code         [String] The auth code received from Instagram's OAuth flow
    # @param redirect_uri [String] The redirect URI used during authorisation
    # @param app_id       [String] Instagram App ID
    # @param app_secret   [String] Instagram App Secret
    # @return [Hash] { success: true, access_token:, expires_at:, user_id: }
    #              | { success: false, error: String }
    def self.exchange_instagram_code(code:, redirect_uri:, app_id:, app_secret:)
      sanitized_code = code.to_s.sub(/#.*\z/, '').strip

      Rails.logger.info "[MetaApiClient::OAuth.exchange_instagram_code] redirect_uri=#{redirect_uri}"

      response = HttpClient.post_form(
        INSTAGRAM_OAUTH_URL,
        body: {
          client_id: app_id,
          client_secret: app_secret,
          grant_type: 'authorization_code',
          redirect_uri: redirect_uri,
          code: sanitized_code
        }
      )

      Rails.logger.info "[MetaApiClient::OAuth.exchange_instagram_code] Response: #{response.code}"

      unless response.success?
        error = response.parsed_response&.dig('error_message') || 'Unknown error'
        Rails.logger.error "[MetaApiClient::OAuth.exchange_instagram_code] #{response.parsed_response}"
        return { success: false, error: error }
      end

      parsed     = response.parsed_response
      token_data = parsed.dig('data', 0) || parsed
      short_lived_token = token_data['access_token']
      user_id           = token_data['user_id']

      Rails.logger.info "[MetaApiClient::OAuth.exchange_instagram_code] Short-lived token obtained, user_id=#{user_id}"

      long_lived_response = HttpClient.get(
        "#{INSTAGRAM_GRAPH_URL}/access_token",
        query: {
          grant_type: 'ig_exchange_token',
          client_secret: app_secret,
          access_token: short_lived_token
        }
      )

      if long_lived_response.success?
        expires_in = long_lived_response.parsed_response['expires_in'].to_i
        {
          success: true,
          access_token: long_lived_response.parsed_response['access_token'],
          expires_at: expires_in.positive? ? Time.now + expires_in.seconds : nil,
          user_id: user_id.to_s
        }
      else
        error = long_lived_response.parsed_response&.dig('error', 'message') || 'Unknown error'
        Rails.logger.error "[MetaApiClient::OAuth.exchange_instagram_code] Long-lived token error: #{error}"
        { success: false, error: error }
      end
    rescue HTTParty::Error, Net::ReadTimeout, Net::OpenTimeout => e
      Rails.logger.error "[MetaApiClient::OAuth.exchange_instagram_code] HTTP error: #{e.message}"
      raise
    end

    # Refreshes a long-lived Instagram user access token.
    # Tokens are valid for 60 days and can be refreshed after the first 24 hours.
    #
    # @param current_token [String] The existing long-lived access token
    # @return [Hash] { success: true, access_token: String, expires_at: Time|nil }
    #              | { success: false, error: String }
    def self.refresh_instagram_token(current_token)
      response = HttpClient.get(
        "#{INSTAGRAM_GRAPH_URL}/refresh_access_token",
        query: { grant_type: 'ig_refresh_token', access_token: current_token }
      )

      if response.success?
        expires_in = response.parsed_response['expires_in'].to_i
        {
          success: true,
          access_token: response.parsed_response['access_token'],
          expires_at: expires_in.positive? ? Time.now + expires_in.seconds : nil
        }
      else
        error = response.parsed_response&.dig('error', 'message') || 'Unknown error'
        { success: false, error: error }
      end
    end
  end
end
