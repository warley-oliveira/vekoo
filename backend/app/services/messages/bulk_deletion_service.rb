# frozen_string_literal: true

module Messages
  # Deletes a batch of messages with two possible scopes:
  #
  # - 'me'       → hard-delete (Mongoid #destroy) from the database. Used when
  #                the operator only wants to remove the messages from their
  #                own view, or when the batch is not eligible for remote
  #                revocation (WABA, incoming messages, expired window, etc.).
  #
  # - 'everyone' → revokes each outgoing message at the provider (Z-API) and
  #                soft-deletes locally (deleted_at + deleted_scope='everyone'),
  #                mirroring the existing Messages::DeletionService behavior.
  #
  # Fallback rule (requested by the product):
  #   If scope='everyone' is requested but ANY message in the batch is
  #   outside the 60h window, is incoming, or the connector does not
  #   support remote revocation, the entire batch falls back to 'me'
  #   (hard-delete).
  class BulkDeletionService
    WHATSAPP_DELETE_WINDOW = DeletionService::WHATSAPP_DELETE_WINDOW

    Result = Struct.new(:success, :scope_applied, :deleted_ids, :revoked_ids, :errors, keyword_init: true) do
      def success?
        success
      end
    end

    def initialize(chat:, message_ids:, scope:, account: nil)
      @chat = chat
      @message_ids  = Array(message_ids).map(&:to_s)
      @scope        = scope.to_s
      @account      = account
    end

    def call
      return failure(I18n.t("connectors.messages.none_given")) if @message_ids.empty?
      return failure(I18n.t("connectors.messages.chat_not_found")) if @chat.blank?

      messages = load_messages
      return failure(I18n.t("connectors.messages.none_found")) if messages.empty?

      effective_scope = resolve_effective_scope

      if effective_scope == "me"
        hard_delete_all(messages)
      else
        revoked_ids = revoke_at_provider(messages)
        soft_delete_all(messages, revoked_ids: revoked_ids)
      end
    end

    private

    def load_messages
      ChatMessage::Base.unscoped.where(chat_id: @chat.id, :id.in => @message_ids).to_a
    end

    # Falls back to 'me' only when the connector doesn't support remote
    # revocation (WABA, WebWidget, etc.) or the operator explicitly asked
    # for 'me'. For Z-API we always try 'everyone': individual messages
    # that are outside the 60h window or that have no remote id are simply
    # soft-deleted locally without the Z-API call (or have the Z-API error
    # swallowed).
    def resolve_effective_scope
      return "me" if @scope == "me"
      return "me" unless connector_supports_revoke?

      "everyone"
    end

    def connector_supports_revoke?
      integ = @chat.connector
      integ.is_a?(Connector::WhatsappWeb) &&
        integ.respond_to?(:zapi_provider?) &&
        integ.zapi_provider?
    end

    def window_expired?(msg)
      reference = msg.original_created_at || msg.created_at
      return false if reference.blank?

      (Time.current - reference) > WHATSAPP_DELETE_WINDOW
    end

    def hard_delete_all(messages)
      ids = messages.map { |m| m.id.to_s }
      messages.each(&:destroy)
      broadcast(ids, "me")
      Result.new(
        success: true,
        scope_applied: "me",
        deleted_ids: ids,
        revoked_ids: [],
        errors: []
      )
    end

    # Attempts to revoke each outgoing message on the provider. Skips messages
    # that are incoming or that never reached the provider (no message_id).
    # Errors per message (e.g. "60h window expired" from Z-API) are logged
    # and ignored — the message is still soft-deleted locally afterwards.
    # Returns the array of ids that were actually revoked (for telemetry).
    def revoke_at_provider(messages)
      phone = @chat.external_id.to_s.split("@").first
      revoked = []
      messages.each do |msg|
        next if msg.role != "assistant"
        next if msg.message_id.blank?

        begin
          @chat.connector.delete_message(
            phone: phone,
            message_id: msg.message_id,
            owner: true
          )
          revoked << msg.id.to_s
        rescue ZapiClient::Error => e
          Rails.logger.warn(
            "[Messages::BulkDeletionService] Z-API delete ignored for #{msg.id}: #{e.message}"
          )
        rescue StandardError => e
          Rails.logger.warn(
            "[Messages::BulkDeletionService] delete error ignored for #{msg.id}: #{e.message}"
          )
        end
      end
      revoked
    end

    def soft_delete_all(messages, revoked_ids: [])
      ids = messages.map { |m| m.id.to_s }
      now = Time.current
      messages.each do |m|
        m.update!(deleted_at: now, deleted_scope: "everyone")
      end
      broadcast(ids, "everyone")
      Result.new(
        success: true,
        scope_applied: "everyone",
        deleted_ids: ids,
        revoked_ids: revoked_ids,
        errors: []
      )
    end

    def broadcast(ids, scope)
      payload = { event: "messages_deleted", messageIds: ids, scope: scope }
      ActionCable.server.broadcast(ChatMessage::Base.stream_for(@chat), payload)
    rescue StandardError => e
      Rails.logger.warn("[Messages::BulkDeletionService] broadcast failed: #{e.message}")
    end

    def failure(reason)
      Result.new(
        success: false,
        scope_applied: nil,
        deleted_ids: [],
        revoked_ids: [],
        errors: Array(reason)
      )
    end
  end
end
