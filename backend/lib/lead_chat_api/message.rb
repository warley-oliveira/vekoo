module LeadChatApi
  class Message
    def initialize(client)
      @client = client
    end

    # Sends a text message to a LeadChat chat
    #
    # @param [String] from The sender of the message
    # @param [String] to The recipient of the message
    # @param [String] message The message to send
    # @return [Hash] The response from the API parsed as a hash
    def send_text_message(from:, to:, message:)
      payload = {
        body: {
          text: message
        },
        to: to.to_s,
        from: from.to_s
      }
      @client.post_request(Endpoints::SYNC_MESSAGE_SLUG, payload)
    end

    def send_text_message_to_session(session_id:, message:)
      payload = {
        text: message
      }
      @client.post_request_ignore_timeout(format(Endpoints::SEND_MESSAGE_SESSION_SYNC, id: session_id), payload)
    end

    # Sends a file message to a LeadChat chat
    #
    # @param [String] from The sender of the message
    # @param [String] to The recipient of the message
    # @param [String] file_url The URL of the file to send
    # @return [Hash] The response from the API parsed as a hash
    def send_file_message(from:, to:, file_url:)
      payload = {
        body: {
          fileUrl: file_url
        },
        to: to.to_s,
        from: from.to_s
      }
      @client.post_request(Endpoints::SYNC_MESSAGE_SLUG, payload)
    end

    def send_file_message_to_session(session_id:, file_url:)
      payload = {
        fileUrl: file_url
      }
      @client.post_request_ignore_timeout(format(Endpoints::SEND_MESSAGE_SESSION_SYNC, id: session_id), payload)
    end

    # Get session information
    #
    # @param [String] id The ID of the session
    # @return [Hash] The response from the API parsed as a hash
    def get_session(id, include_details = [])
      parameters = "?"
      parameters += include_details.map { |i| "includeDetails=#{i}" }.join("&") if include_details
      fetch_or_cache("leadchat-session-#{id}") do
        @client.get_request("#{Endpoints::SESSION_SLUG}/#{id}#{parameters}")
        # @client.get_request("#{Endpoints::SESSION_SLUG}/#{id}", { includeDetails: include_details })
      end
    end

    # Get contact information
    #
    # @param [String] id The ID of the contact
    # @return [Hash] The response from the API parsed as a hash
    def get_contact(id)
      fetch_or_cache("leadchat-contact-#{id}") do
        @client.get_request("#{Endpoints::CONTACT_SLUG}/#{id}")
      end
    end

    private

    # Caches a value for 1 hour
    #
    # @param [String] cache_key The key to cache the value under
    # @param [Proc] block The block to call to get the value
    # @return [Object] The cached value
    def fetch_or_cache(cache_key, &block)
      return block.call unless @client.cache_permitted

      Rails.cache.fetch(cache_key, expires_in: Config::CACHE_EXPIRE_IN, &block)
    end
  end
end
