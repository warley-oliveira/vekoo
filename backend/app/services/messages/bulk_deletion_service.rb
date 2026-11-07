# frozen_string_literal: true

module Messages
  # Apaga um lote de mensagens só daqui (Mongoid #destroy): some da conversa para quem atende, e o
  # contato continua vendo no aplicativo dele. Nenhum canal ligado hoje revoga mensagem no provedor.
  class BulkDeletionService
    Result = Struct.new(:success, :deleted_ids, :errors, keyword_init: true) do
      def success?
        success
      end
    end

    def initialize(chat:, message_ids:)
      @chat = chat
      @message_ids = Array(message_ids).map(&:to_s)
    end

    def call
      return failure(I18n.t("connectors.messages.none_given")) if @message_ids.empty?
      return failure(I18n.t("connectors.messages.chat_not_found")) if @chat.blank?

      messages = ChatMessage::Base.unscoped.where(chat_id: @chat.id, :id.in => @message_ids).to_a
      return failure(I18n.t("connectors.messages.none_found")) if messages.empty?

      ids = messages.map { |m| m.id.to_s }
      messages.each(&:destroy)
      broadcast(ids)
      Result.new(success: true, deleted_ids: ids, errors: [])
    end

    private

    def broadcast(ids)
      payload = { event: "messages_deleted", messageIds: ids }
      ActionCable.server.broadcast(ChatMessage::Base.stream_for(@chat), payload)
    rescue StandardError => e
      Rails.logger.warn("[Messages::BulkDeletionService] broadcast failed: #{e.message}")
    end

    def failure(reason)
      Result.new(success: false, deleted_ids: [], errors: Array(reason))
    end
  end
end
