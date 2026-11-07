# frozen_string_literal: true

class ZapiClient
  # Text messaging methods
  module Messaging
    # Sends a simple text message.
    # @param phone [String] Recipient phone number
    # @param message [String] Message content
    # @param delay [Integer, nil] Delay in seconds before sending
    # @param delay_typing [Integer, nil] Seconds to simulate "typing..." status
    # @param message_id [String, nil] External message id to quote/reply.
    #   When provided, Z-API sends the message as a reply to the original.
    # @return [Hash] API response
    def send_text(phone, message, delay: nil, delay_typing: nil, message_id: nil)
      payload = { phone: phone, message: message }
      payload[:delayMessage] = delay if delay
      payload[:delayTyping] = delay_typing if delay_typing
      payload[:messageId] = message_id if message_id.to_s.strip.length.positive?

      request(:post, "send-text", body: payload)
    end

    def metadata(phone)
      request(:get, "chats/#{phone}")
    end

    def list_contacts
      request(:get, "contacts")
    end

    def contact_metadata(phone)
      request(:get, "contacts/#{phone}")
    end

    def chats(page: 1, page_size: 20)
      request(:get, "chats?page=#{page}&pageSize=#{page_size}")
    end

    # Revokes ("delete for everyone") a message previously sent through this
    # instance. Within WhatsApp's allowed window (~60h for consumer) the
    # message disappears from the recipient's device too; outside that window
    # Z-API still accepts the request but the recipient keeps the message.
    #
    # @param phone [String] Recipient phone number (DDI+DDD+number, no @ suffix)
    # @param message_id [String] External message id returned by Z-API on send
    # @param owner [Boolean] true when the message was sent by the instance
    # @return [Hash, nil] Parsed response (Z-API returns 200 with empty body)
    def delete_message(phone:, message_id:, owner: true)
      query = URI.encode_www_form(
        messageId: message_id,
        phone: phone,
        owner: owner.to_s
      )
      request(:delete, "messages?#{query}")
    end
  end
end
