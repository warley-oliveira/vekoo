# frozen_string_literal: true

# Meta (Facebook & Instagram) API Client
#
# Centralises all HTTParty HTTP calls for the Facebook Graph API and the
# Instagram Graph API, keeping networking logic out of models and concerns.
#
# == Instance usage (messaging & profile endpoints)
#
#   client = MetaApiClient.new(
#     token:       page_access_token,
#     endpoint_id: page_id,
#     base_url:    MetaApiClient::FACEBOOK_GRAPH_URL
#   )
#   client.send_text(recipient_id, 'Hello!')
#   client.send_media(recipient_id, 'image', 'https://...')
#   client.send_typing_indicator(recipient_id)
#   client.mark_seen(recipient_id)
#   client.download_media('https://...')
#   client.fetch_instagram_profile(ig_account_id)
#   client.fetch_instagram_sender_profile(sender_id)
#
# == Module-level usage (OAuth & standalone Graph queries)
#
#   MetaApiClient::OAuth.exchange_facebook_code(code:, app_id:, app_secret:)
#   MetaApiClient::OAuth.exchange_instagram_code(code:, redirect_uri:, app_id:, app_secret:)
#   MetaApiClient::OAuth.refresh_instagram_token(current_token)
#
#   MetaApiClient::Graph.fetch_page_info(user_access_token)
#   MetaApiClient::Graph.fetch_instagram_account_for_page(page_id, token)
#   MetaApiClient::Graph.fetch_instagram_me(token)
#   MetaApiClient::Graph.subscribe_page_webhooks(page_id, token)
class MetaApiClient
  include Messaging
  include Graph

  FACEBOOK_GRAPH_URL = "https://graph.facebook.com/v22.0"
  INSTAGRAM_GRAPH_URL = "https://graph.instagram.com/v22.0"

  attr_reader :token, :endpoint_id, :base_url

  # @param token       [String] Bearer token (page_access_token or instagram_user_access_token)
  # @param endpoint_id [String] Page ID or Instagram account ID used in API path segments
  # @param base_url    [String] Graph API root – defaults to Facebook Graph URL
  def initialize(token:, endpoint_id:, base_url: FACEBOOK_GRAPH_URL)
    @token       = token
    @endpoint_id = endpoint_id
    @base_url    = base_url
  end
end
