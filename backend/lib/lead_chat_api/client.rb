module LeadChatApi
  class Client
    attr_reader :connection, :api_key, :cache_permitted

    def initialize(api_key, cache: false)
      @cache_permitted = cache
      @api_key = api_key
      @connection = Faraday.new(url: Config::API_BASE_URL) do |conn|
        conn.options.timeout = 30
      end

      @connection_small_timeout = Faraday.new(url: Config::API_BASE_URL) do |conn|
        conn.options.timeout = 2
      end
    end

    def post_request(endpoint, payload)
      response = @connection.post(endpoint) do |req|
        req.headers['Authorization'] = "Bearer #{@api_key}"
        req.headers['Content-Type'] = 'application/json'
        req.body = payload.to_json
      end
      log_request(endpoint, payload, response)
      parse_response(response)
    rescue Faraday::TimeoutError => e
      Rails.logger.warn("[LeadChatApi] TimeoutError: #{e.message}. Endpoint: #{endpoint}, Payload: #{payload.to_json}")
      nil # Retorna `nil` ou qualquer outra ação que você prefira em caso de timeout
    rescue StandardError => e
      Rails.logger.error("[LeadChatApi] Error: #{e.message}. Endpoint: #{endpoint}, Payload: #{payload.to_json}")
      raise
    end

    def post_request_ignore_timeout(endpoint, payload)
      response = @connection_small_timeout.post(endpoint) do |req|
        req.headers['Authorization'] = "Bearer #{@api_key}"
        req.headers['Content-Type'] = 'application/json'
        req.body = payload.to_json
      end
      log_request(endpoint, payload, response)
      parse_response(response)
    rescue Faraday::TimeoutError => e
      Rails.logger.warn("[LeadChatApi] TimeoutError: #{e.message}. Endpoint: #{endpoint}, Payload: #{payload.to_json}")
      nil # Retorna `nil` ou qualquer outra ação que você prefira em caso de timeout
    rescue StandardError => e
      Rails.logger.error("[LeadChatApi] Error: #{e.message}. Endpoint: #{endpoint}, Payload: #{payload.to_json}")
      raise
    end

    def get_request(endpoint, _params = {})
      response = HTTParty.get(
        "#{Config::API_BASE_URL}#{endpoint}",
        headers: {
          'Authorization' => "Bearer #{@api_key}",
          'Content-Type' => 'application/json'
        }
        # query: params
      )
      log_request(endpoint, {}, response)
      # puts response.request.last_uri
      JSON.parse(response.body, symbolize_names: true)
    end

    def delete_request(endpoint)
      response = @connection.delete(endpoint) do |req|
        req.headers['Authorization'] = "Bearer #{@api_key}"
        req.headers['Content-Type'] = 'application/json'
      end
      log_request(endpoint, {}, response)
      handle_response(response)
    rescue JSON::ParserError
      nil
    end

    private

    def log_request(endpoint, payload, response)
      Rails.logger.info("[LeadChatApi] Endpoint: #{endpoint}, Body: #{payload.to_json}")
      Rails.logger.info("[LeadChatApi] Response: #{response.body}")
    end

    def handle_response(response)
      if response.success?
        parse_response(response)
      else
        handle_error(response)
      end
    end

    def parse_response(response)
      JSON.parse(response.body, symbolize_names: true)
    rescue StandardError => e
      Rails.logger.error("[LeadChatApi] Failed to parse response: #{e.message}")
      raise
    end

    def handle_error(response)
      raise LeadChatApi::Error.new(response.status, response.body)
    end
  end
end
