# frozen_string_literal: true

# Z-API Connector Client for WhatsApp messaging
# Requires HTTParty and URI gems (available in Rails), and uses Base64 from standard library
#
# Usage:
#   client = ZapiClient.new('INSTANCE_ID', 'TOKEN', account_token: 'ACCOUNT_TOKEN')
#   client.send_text('5511999999999', 'Hello!')
#
# Partner/Integrator methods:
#   ZapiClient.create_instance('My Instance', account_token: 'ACCOUNT_TOKEN')
#   ZapiClient.sign_instance('INSTANCE_ID', 'TOKEN', account_token: 'ACCOUNT_TOKEN')


class ZapiClient
  include HTTParty
  include Messaging
  include Media
  include Presence
  include Connection

  BASE_URL = 'https://api.z-api.io'
  MAX_RETRIES = 3

  attr_reader :instance_id, :token, :account_token

  # Initializes the client with Z-API credentials.
  # @param instance_id [String] Z-API Instance ID
  # @param token [String] Z-API Token
  # @param account_token [String, nil] Optional Client-Token for account-level operations
  def initialize(instance_id, token, account_token: nil)
    @instance_id = instance_id
    @token = token
    @account_token = account_token
    @base_uri = "#{BASE_URL}/instances/#{instance_id}/token/#{token}".freeze
  end

  # Creates a new Z-API instance linked to the integrator account.
  # @see ZapiClient::Partner.create_instance
  def self.create_instance(name, account_token:, **options)
    Partner.create_instance(name, account_token: account_token, **options)
  end

  # Signs/subscribes a Z-API instance to activate it permanently.
  # @see ZapiClient::Partner.sign_instance
  def self.sign_instance(instance_id, token, account_token:)
    Partner.sign_instance(instance_id, token, account_token: account_token)
  end

  # Signs the current instance using configured credentials.
  # @return [Boolean] true on success
  # @raise [ZapiClient::Error] If account_token is not configured
  def sign_instance
    raise Error, 'Account token is required to sign an instance' unless @account_token

    self.class.sign_instance(@instance_id, @token, account_token: @account_token)
  end

  private

  # Default headers for API requests
  # @return [Hash] Headers including Content-Type and optional Client-Token
  def default_headers
    headers = { 'Content-Type' => 'application/json' }
    headers['Client-Token'] = @account_token if @account_token
    headers
  end

  # Executes an HTTP request with error handling and retries.
  # @param method [Symbol] HTTP method (:get, :post, :put, etc.)
  # @param endpoint [String] API endpoint (appended to base URI)
  # @param body [Hash, nil] Request body (will be converted to JSON)
  # @return [Hash, Array, nil] Parsed JSON response or nil if empty
  # @raise [ZapiClient::Error] On request failure
  def request(method, endpoint, body: nil)
    url = "#{@base_uri}/#{endpoint}"
    tries = 0

    begin
      response = HTTParty.send(
        method,
        url,
        headers: default_headers,
        body: body&.to_json,
        timeout: 15
      )

      handle_response(response, tries)
    rescue Error
      raise
    rescue StandardError => e
      handle_request_error(e, tries)
    end
  end

  # Handles the HTTP response
  # @param response [HTTParty::Response] HTTP response
  # @param tries [Integer] Current attempt number
  # @return [Hash, Array, nil] Parsed response
  # @raise [ZapiClient::Error] On non-success response
  def handle_response(response, tries)
    return response.parsed_response if response.success?

    if response.code >= 500
      log_warn("Z-API server error (HTTP #{response.code}), attempt #{tries + 1} of #{MAX_RETRIES}")
    else
      log_error("Z-API request failed: HTTP #{response.code} - #{response.body}")
    end
    
    # Na origem o 5xx devolvia o retorno do logger (`true`), e quem chamava quebrava
    # depois com "undefined method dig for true" em vez de ver a falha do provedor.
    raise Error, "Z-API request failed (HTTP #{response.code})"
  end

  # Handles request errors with retry logic
  # @param error [StandardError] The caught error
  # @param tries [Integer] Current attempt number
  # @raise [ZapiClient::Error] Sempre. Na origem o erro de rede subia cru (`request` nunca
  #   repetia a chamada), escapava de todo `rescue ZapiClient::Error` e esperava 1s à toa.
  #   Repetir de verdade duplicaria mensagem depois de um timeout de leitura, por isso não há.
  def handle_request_error(error, _tries)
    log_error("Z-API connection error: #{error.message}")
    raise ConnectionError, "Z-API connection error: #{error.message}"
  end

  # Logs a warning message
  # @param message [String] Message to log
  def log_warn(message)
    Rails.logger.warn(message) if defined?(Rails)
  end

  # Logs an error message
  # @param message [String] Message to log
  def log_error(message)
    Rails.logger.error(message) if defined?(Rails)
  end
end
