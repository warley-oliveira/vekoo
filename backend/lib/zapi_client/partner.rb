# frozen_string_literal: true

class ZapiClient
  # Partner/Integrator methods for instance management
  module Partner
    # Creates a new Z-API instance linked to the integrator account.
    # The instance has a 2-day trial period before requiring subscription.
    #
    # @param name [String] Instance name (required)
    # @param account_token [String] Client-Token for the integrator account (required)
    # @param options [Hash] Additional options:
    #   - session_name: Session name in WhatsApp (connected devices)
    #   - delivery_callback_url: Webhook for delivered messages
    #   - received_callback_url: Webhook for received messages
    #   - received_and_delivery_callback_url: Webhook for both received and sent messages
    #   - disconnected_callback_url: Disconnection webhook
    #   - connected_callback_url: Connection webhook
    #   - message_status_callback_url: Message status webhook
    #   - call_reject_auto: Auto-reject calls (boolean)
    #   - call_reject_message: Message after rejecting a call
    #   - auto_read_message: Auto-read messages (boolean)
    #   - is_device: Whether instance is mobile or web (boolean)
    #   - business_device: WhatsApp Business version (boolean)
    # @return [Hash] { 'id' => String, 'token' => String, 'due' => String }
    # @raise [ZapiClient::Error] On creation failure
    def self.create_instance(name, account_token:, **options)
      url = "#{ZapiClient::BASE_URL}/instances/integrator/on-demand"
      payload = build_create_instance_payload(name, options)
      headers = { 'Content-Type' => 'application/json', 'Authorization' => "Bearer #{account_token}" }

      execute_with_retries('create instance') do
        response = HTTParty.post(url, headers: headers, body: payload.to_json, timeout: 15)

        if response.success?
          response.parsed_response
        else
          log_error("Failed to create Z-API instance: HTTP #{response.code} - #{response.body}")
          raise ZapiClient::Error, "Failed to create Z-API instance (HTTP #{response.code})"
        end
      end
    end

    # Signs/subscribes a Z-API instance to activate it permanently.
    # Must be called within 2 days of creation to prevent automatic deletion.
    #
    # @param instance_id [String] Instance ID to sign
    # @param token [String] Instance token
    # @param account_token [String] Client-Token for the integrator account
    # @return [Boolean] true on success
    # @raise [ZapiClient::Error] On subscription failure
    def self.sign_instance(instance_id, token, account_token:)
      url = "#{ZapiClient::BASE_URL}/instances/#{instance_id}/token/#{token}/integrator/on-demand/subscription"
      headers = { 'Content-Type' => 'application/json', 'Authorization' => "Bearer #{account_token}" }

      execute_with_retries('sign instance') do
        response = HTTParty.post(url, headers: headers, timeout: 15)

        if response.success? || response.code == 201
          true
        else
          log_error("Failed to sign Z-API instance: HTTP #{response.code} - #{response.body}")
          raise ZapiClient::Error, "Failed to sign Z-API instance (HTTP #{response.code})"
        end
      end
    end

    # Builds the payload for create_instance request
    # @param name [String] Instance name
    # @param options [Hash] Additional options
    # @return [Hash] Request payload
    def self.build_create_instance_payload(name, options)
      payload = { name: name }

      option_mappings = {
        session_name: :sessionName,
        delivery_callback_url: :deliveryCallbackUrl,
        received_callback_url: :receivedCallbackUrl,
        received_and_delivery_callback_url: :receivedAndDeliveryCallbackUrl,
        disconnected_callback_url: :disconnectedCallbackUrl,
        connected_callback_url: :connectedCallbackUrl,
        message_status_callback_url: :messageStatusCallbackUrl,
        call_reject_auto: :callRejectAuto,
        call_reject_message: :callRejectMessage,
        auto_read_message: :autoReadMessage,
        is_device: :isDevice,
        business_device: :businessDevice,
        notify_sent_by_me: :notifySentByMe
      }

      option_mappings.each do |ruby_key, api_key|
        payload[api_key] = options[ruby_key] if options.key?(ruby_key)
      end

      payload
    end
    private_class_method :build_create_instance_payload

    # Executes a block with retry logic
    # @param operation_name [String] Name of the operation for logging
    # @yield Block to execute
    # @return [Object] Result of the block
    # @raise [ZapiClient::Error] After max retries exceeded
    def self.execute_with_retries(operation_name, max_retries: ZapiClient::MAX_RETRIES)
      tries = 0

      begin
        yield
      rescue ZapiClient::Error
        raise
      rescue StandardError => e
        tries += 1

        if tries < max_retries
          log_warn("Attempt #{tries} failed for #{operation_name}: #{e.message}. Retrying...")
          sleep(1)
          retry
        end

        log_error("Error in #{operation_name}: #{e.message}")
        raise ZapiClient::Error, "Error in Z-API #{operation_name}: #{e.message}"
      end
    end
    private_class_method :execute_with_retries

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
