# frozen_string_literal: true

class ZapiClient
  # Instance connection methods (QR Code, disconnect, etc.)
  module Connection
    # Gets the QR Code bytes for connecting the instance.
    # The QR Code is invalidated every 20 seconds by WhatsApp.
    # @return [String] QR Code bytes that can be rendered in a QR Code component
    # @raise [ZapiClient::Error] On request failure or if already connected
    def get_qr_code
      request(:get, "qr-code")
    end

    # Gets the QR Code as a Base64 image.
    # The QR Code is invalidated every 20 seconds by WhatsApp.
    # @return [Hash] Response containing the Base64 image data
    # @raise [ZapiClient::Error] On request failure or if already connected
    def get_qr_code_image
      request(:get, "qr-code/image")
    end

    # Gets a pairing code for connecting without QR Code scanning.
    # The code can be entered directly in WhatsApp under "Connect with phone number".
    # @param phone [String] Phone number to generate the code for
    # @return [Hash] Response containing the pairing code
    # @raise [ZapiClient::Error] On request failure
    def get_phone_code(phone)
      phone = sanitize_phone(phone)
      request(:get, "phone-code/#{phone}")
    end

    # Disconnects the instance from WhatsApp.
    # Once disconnected, all API methods become unavailable and webhooks stop being sent.
    # To reconnect, simply scan the QR Code again.
    # @return [Hash, Boolean] Response from the API or true on success
    # @raise [ZapiClient::Error] On request failure
    def disconnect
      request(:get, "disconnect")
    end

    # Enables or disables notification of messages sent by the instance itself.
    # When enabled, the received webhook will also fire for messages sent by the connected device.
    # @param enabled [Boolean] Whether to enable sent-by-me notifications (default: true)
    # @return [Hash] Response from the API
    # @raise [ZapiClient::Error] On request failure
    def update_notify_sent_by_me(enabled: true)
      request(:put, "update-notify-sent-by-me", body: { notifySentByMe: enabled })
    end

    private

    # Sanitizes phone number by removing non-digit characters
    # @param phone [String] Phone number
    # @return [String] Sanitized phone number
    def sanitize_phone(phone)
      phone.to_s.gsub(/\D/, "")
    end
  end
end
