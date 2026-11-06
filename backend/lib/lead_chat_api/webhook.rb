module LeadChatApi
  class Webhook
    SUBSCRIPTION_TOPICS = %w[MESSAGE_RECEIVED MESSAGE_SENT].freeze

    def initialize(client)
      @client = client
    end

    # Creates a webhook subscription
    #
    # @param [String] name The name of the subscription
    # @param [String] url The URL of the webhook
    # @param [Array<String>] topics The topics to subscribe to
    # @return [Hash] The response from the API parsed as a hash
    def create_subscription(name, url, topics = SUBSCRIPTION_TOPICS)
      payload = {
        name: name,
        url: url,
        topics: topics
      }
      @client.post_request(Endpoints::SUBSCRIPTION_SLUG, payload)
    end

    # Lists all webhook subscriptions
    #
    # @return [Array<Hash>] The response from the API parsed as an array of hashes
    def list_subscriptions
      @client.get_request(Endpoints::SUBSCRIPTION_SLUG)
    end

    # Deletes a webhook subscription
    #
    # @param [String] id The ID of the subscription
    # @return [Hash] The response from the API parsed as a hash
    def delete_subscription(id)
      @client.delete_request("#{Endpoints::SUBSCRIPTION_SLUG}/#{id}")
    end
  end
end
