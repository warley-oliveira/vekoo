# frozen_string_literal: true

class ZapiClient
  # Presence and read status methods
  module Presence
    ALLOWED_PRESENCE_STATUSES = %w[unavailable available composing recording paused].freeze

    # Marks a specific message as read (seen).
    # @param phone [String] Contact/group phone number
    # @param message_id [String] ID of the message to mark as read
    # @return [Boolean] true on success
    def mark_as_read(phone, message_id)
      payload = { phone: phone, messageId: message_id }
      response = request(:post, 'read-message', body: payload)

      # The endpoint returns 204 No Content on success
      return true if response.nil? || (response.respond_to?(:empty?) && response.empty?)

      true
    end

    # Updates the presence status in a chat.
    # @param phone [String] Contact phone number
    # @param presence_status [String] One of: "unavailable", "available", "composing", "recording", "paused"
    #   - "composing" shows "typing..." to the contact
    #   - "recording" shows "recording audio..."
    # @param duration [Integer] Duration in milliseconds to maintain the status before returning to "paused"
    # @return [Boolean] true on success
    # @raise [ZapiClient::Error] On invalid status or request failure
    def update_presence(phone, presence_status, duration: 1200)
      presence_status = presence_status.to_s.downcase

      unless ALLOWED_PRESENCE_STATUSES.include?(presence_status)
        raise Error, "Invalid presence status: #{presence_status}. Allowed: #{ALLOWED_PRESENCE_STATUSES.join(', ')}"
      end

      payload = { presence: presence_status, delay: duration }
      url = "#{@base_uri}/chat/updatePresence?number=#{phone}"

      begin
        response = HTTParty.put(url, headers: default_headers, body: payload.to_json, timeout: 5)

        unless response.success?
          Rails.logger.error("Failed to update presence: HTTP #{response.code} - #{response.body}") if defined?(Rails)
          raise Error, "Failed to update presence (HTTP #{response.code})"
        end

        true
      rescue Error
        raise
      rescue StandardError => e
        Rails.logger.error("Error in update_presence request: #{e.message}") if defined?(Rails)
        raise Error, "Error updating presence status: #{e.message}"
      end
    end
  end
end
