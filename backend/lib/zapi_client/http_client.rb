# frozen_string_literal: true

class ZapiClient
  # Handles HTTP requests with retry logic and error handling
  module HttpClient
    # Executes an HTTP request with error handling and retries.
    # @param method [Symbol] HTTP method (:get, :post, :put, etc.)
    # @param url [String] Full URL for the request
    # @param headers [Hash] Request headers
    # @param body [Hash, nil] Request body (will be converted to JSON)
    # @param timeout [Integer] Request timeout in seconds
    # @param max_retries [Integer] Maximum number of retry attempts
    # @return [Hash, Array, nil] Parsed JSON response or nil if empty
    # @raise [ZapiClient::Error] On request failure
    def self.request(method, url, headers:, body: nil, timeout: 15, max_retries: 3)
      tries = 0

      begin
        response = HTTParty.send(
          method,
          url,
          headers: headers,
          body: body&.to_json,
          timeout: timeout
        )

        handle_response(response, max_retries, tries)
      rescue ZapiClient::Error
        raise
      rescue StandardError => e
        handle_error(e, tries, max_retries)
      end
    end

    # Handles the HTTP response
    # @param response [HTTParty::Response] HTTP response
    # @param max_retries [Integer] Maximum retry attempts
    # @param tries [Integer] Current attempt number
    # @return [Hash, Array, nil] Parsed response
    # @raise [ZapiClient::Error] On non-success response
    def self.handle_response(response, max_retries, tries)
      return response.parsed_response if response.success?

      if response.code >= 500
        log_warn("Z-API server error (HTTP #{response.code}), attempt #{tries + 1} of #{max_retries}")
        # Server error - could implement retry logic here if needed
      end

      log_error("Z-API request failed: HTTP #{response.code} - #{response.body}")
      raise ZapiClient::Error, "Z-API request failed (HTTP #{response.code})"
    end
    private_class_method :handle_response

    # Handles request errors with retry logic
    # @param error [StandardError] The caught error
    # @param tries [Integer] Current attempt number
    # @param max_retries [Integer] Maximum retry attempts
    # @raise [ZapiClient::Error] After max retries exceeded
    def self.handle_error(error, tries, max_retries)
      tries += 1

      if tries < max_retries
        log_warn("Attempt #{tries} failed: #{error.message}. Retrying...")
        sleep(1)
        raise error # Re-raise to trigger retry in caller
      end

      log_error("Z-API connection error: #{error.message}")
      raise ZapiClient::ConnectionError, "Z-API connection error: #{error.message}"
    end
    private_class_method :handle_error

    # Logs a warning message
    # @param message [String] Message to log
    def self.log_warn(message)
      Rails.logger.warn(message) if defined?(Rails)
    end
    private_class_method :log_warn

    # Logs an error message
    # @param message [String] Message to log
    def self.log_error(message)
      Rails.logger.error(message) if defined?(Rails)
    end
    private_class_method :log_error
  end
end
