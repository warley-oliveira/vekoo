# frozen_string_literal: true

module Messages
  # Soft-deletes a chat message and, when supported by the provider, revokes
  # it remotely so the recipient's WhatsApp also stops showing it.
  #
  # Supported providers:
  # - Z-API (Connector::WhatsappWeb with provider_api == 'zapi'): calls
  #   the Z-API DELETE /messages endpoint for outgoing messages.
  # - WABA (Connector::WhatsappCloud): not supported by Meta's Cloud API;
  #   the service rejects the request and the frontend hides the option.
  #
  # Time window matches WhatsApp consumer rules (~60h after creation).
  class DeletionService
    WHATSAPP_DELETE_WINDOW = 60.hours

    Result = Struct.new(:success, :message, :errors, keyword_init: true) do
      def success?
        success
      end
    end

    def initialize(message:)
      @message = message
      @chat = message.chat
      @connector = @chat&.connector
    end

    def call
      return success_result if message.deleted?

      error = validate
      return failure(error) if error

      revoke_at_provider if outgoing? && message.message_id.present?
      message.update!(deleted_at: Time.current, deleted_scope: "everyone")

      success_result
    rescue ZapiClient::Error => e
      Rails.logger.error("[Messages::DeletionService] Z-API failed: #{e.message}")
      failure(I18n.t("connectors.messages.delete_failed"))
    end

    private

    attr_reader :message, :chat, :connector

    def validate
      return I18n.t("connectors.messages.chat_not_found") if chat.blank?
      return I18n.t("connectors.messages.connector_not_found") if connector.blank?
      return I18n.t("connectors.messages.delete_unsupported") unless provider_supports_delete?
      return I18n.t("connectors.messages.delete_window_expired") if window_expired?

      nil
    end

    def provider_supports_delete?
      connector.is_a?(Connector::WhatsappWeb) && connector.zapi_provider?
    end

    def window_expired?
      reference = message.original_created_at || message.created_at
      return false if reference.blank?

      (Time.current - reference) > WHATSAPP_DELETE_WINDOW
    end

    def outgoing?
      message.role == "assistant"
    end

    def revoke_at_provider
      connector.delete_message(
        phone: recipient_phone,
        message_id: message.message_id,
        owner: true
      )
    end

    def recipient_phone
      raw = chat.external_id.to_s
      raw.split("@").first
    end

    def success_result
      Result.new(success: true, message: message, errors: [])
    end

    def failure(reason)
      Result.new(success: false, message: message, errors: Array(reason))
    end
  end
end
