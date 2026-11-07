# frozen_string_literal: true

class MetaApiClient
  # Instance methods for sending messages and media through the Meta Messaging API.
  # Included directly into MetaApiClient – uses @base_url, @endpoint_id, and @token
  # that are set by MetaApiClient#initialize.
  module Messaging
    # Sends a plain-text message to a recipient.
    #
    # @param recipient_id [String] PSID / IGSID of the recipient
    # @param text         [String] Message body
    # @return [HTTParty::Response]
    def send_text(recipient_id, text)
      Rails.logger.info "[MetaApiClient] Sending text to #{recipient_id}"

      response = HttpClient.post(
        "#{@base_url}/#{@endpoint_id}/messages",
        headers: bearer_headers,
        body: {
          recipient: { id: recipient_id },
          messaging_type: "RESPONSE",
          message: { text: text }
        }
      )

      Rails.logger.info "[MetaApiClient#send_text] Response: #{response.code}"

      unless response.success?
        error = response.parsed_response&.dig("error", "message") || "Unknown error"
        Rails.logger.error "[MetaApiClient#send_text] Error: #{error}"
      end

      response
    end

    # Sends a media attachment (image, video, audio, file) to a recipient.
    #
    # @param recipient_id   [String] PSID / IGSID of the recipient
    # @param attachment_type [String] One of: image, video, audio, file
    # @param media_url      [String] Publicly accessible URL of the media
    # @return [HTTParty::Response]
    def send_media(recipient_id, attachment_type, media_url)
      Rails.logger.info "[MetaApiClient] Sending #{attachment_type} to #{recipient_id}"

      response = HttpClient.post(
        "#{@base_url}/#{@endpoint_id}/messages",
        headers: bearer_headers,
        body: {
          recipient: { id: recipient_id },
          messaging_type: "RESPONSE",
          message: {
            attachment: {
              type: attachment_type,
              payload: { url: media_url, is_reusable: true }
            }
          }
        }
      )

      Rails.logger.info "[MetaApiClient#send_media] Response: #{response.code}"
      response
    end

    # Sends a "typing…" sender action to a recipient.
    #
    # @param recipient_id [String] PSID / IGSID of the recipient
    # @return [HTTParty::Response]
    def send_typing_indicator(recipient_id)
      HttpClient.post(
        "#{@base_url}/#{@endpoint_id}/messages",
        headers: bearer_headers,
        body: { recipient: { id: recipient_id }, sender_action: "typing_on" },
        timeout: 10
      )
    end

    # Sends a "mark as seen" sender action to a recipient.
    #
    # @param recipient_id [String] PSID / IGSID of the recipient
    # @return [HTTParty::Response]
    def mark_seen(recipient_id)
      HttpClient.post(
        "#{@base_url}/#{@endpoint_id}/messages",
        headers: bearer_headers,
        body: { recipient: { id: recipient_id }, sender_action: "mark_seen" },
        timeout: 10
      )
    end

    # Streams a remote media file to a temporary local file.
    #
    # @param url [String] Public URL of the media to download
    # @return [String, nil] Absolute path to the temp file, or nil on failure
    def download_media(url)
      Rails.logger.info "[MetaApiClient] Downloading media"
      HttpClient.stream_download(url)
    end

    private

    def bearer_headers
      {
        "Content-Type" => "application/json",
        "Authorization" => "Bearer #{@token}"
      }
    end
  end
end
