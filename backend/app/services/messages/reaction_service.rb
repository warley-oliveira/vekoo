# frozen_string_literal: true

module Messages
  # Reage a uma mensagem do chat pelo lado do operador, replicando a semântica
  # do WhatsApp: cada lado tem no máximo UMA reação por mensagem, trocar o emoji
  # substitui a anterior e reagir com o mesmo emoji (ou com string vazia) remove.
  #
  # Suporte por provider:
  # - Evolution API (`Connector::WhatsappWeb` com `provider_api == 'evolution_api'`):
  #   `POST /message/sendReaction/{instance}`.
  # - AIVA e WABA: não expõem envio de reação — o service recusa e o
  #   frontend esconde a opção (gate por `connector_provider`).
  class ReactionService
    # A Evolution valida "um emoji ou string vazia" e devolve 400 caso contrário;
    # validamos antes para transformar isso num erro legível em vez de exceção.
    EMOJI_PATTERN = /\A[\p{Emoji_Presentation}\p{Extended_Pictographic}]/

    Result = Struct.new(:success, :message, :errors, keyword_init: true) do
      def success?
        success
      end
    end

    def initialize(message:, emoji:, account: nil)
      @message = message
      @emoji = emoji.to_s.strip
      @account = account
      @chat = message.chat
      @connector = @chat&.connector
    end

    def call
      error = validate
      return failure(error) if error

      begin
        send_at_provider
      rescue StandardError => e
        Rails.logger.error("[Messages::ReactionService] Falha no provedor: #{e.message}")
        return failure(I18n.t("connectors.messages.reaction_failed"))
      end

      # O before_update de ChatMessage::Base transmite a mensagem atualizada
      # quando `reactions` muda — é assim que a bolha reage em tempo real.
      message.update!(
        reactions: message.apply_reaction(
          emoji,
          from: "assistant",
          sender_name: account&.name,
          account_id: account&.id
        )
      )

      success_result
    end

    private

    attr_reader :message, :emoji, :account, :chat, :connector

    def validate
      return I18n.t("connectors.messages.chat_not_found") if chat.blank?
      return I18n.t("connectors.messages.connector_not_found") if connector.blank?
      return I18n.t("connectors.messages.reaction_unsupported") unless provider_supports_reaction?
      return I18n.t("connectors.messages.reaction_no_external_id") if message.message_id.blank?
      return I18n.t("connectors.messages.reaction_deleted") if message.deleted?
      return I18n.t("connectors.messages.reaction_single_emoji") unless valid_emoji?

      nil
    end

    def provider_supports_reaction?
      connector.is_a?(Connector::WhatsappWeb) && connector.evolution_provider?
    end

    # Vazio é válido: é como o protocolo representa a remoção da reação.
    # `grapheme_clusters` mantém tom de pele e sequências ZWJ como um só emoji.
    def valid_emoji?
      return true if emoji.blank?
      return false unless emoji.grapheme_clusters.size == 1

      emoji.match?(EMOJI_PATTERN)
    end

    def send_at_provider
      connector.send_reaction(recipient_phone, message.message_id, outgoing?, emoji)
    end

    # `key.fromMe` descreve a mensagem ALVO: true quando fomos nós que a enviamos.
    def outgoing?
      message.role == "assistant"
    end

    def recipient_phone
      chat.external_id.to_s.split("@").first
    end

    def success_result
      Result.new(success: true, message: message, errors: [])
    end

    def failure(reason)
      Result.new(success: false, message: message, errors: Array(reason))
    end
  end
end
