module Pipelines
  # Cria um card a partir de uma conversa. Quem chama já resolveu a conversa com o critério certo:
  # `Chat.visible_to(account)` em nome de uma pessoa, a conversa do contexto em script e fluxo. A
  # origem fazia `Conversation.find(id)`, que alcançava a conversa de qualquer organização.
  class CardCreatorFromChat
    def self.call(chat:, board:, stage: nil, created_by: nil, attributes: {})
      new(chat: chat, board: board, stage: stage, created_by: created_by, attributes: attributes).create
    end

    def initialize(chat:, board:, stage:, created_by:, attributes:)
      @chat = chat
      @board = board
      @stage = stage
      @created_by = created_by
      @attributes = attributes
    end

    def create
      target = @stage || @board.stages.first
      raise ActiveRecord::RecordNotFound, "Board has no stages" unless target

      target.cards.create!(
        {
          title: contact_name,
          description: description,
          chat_id: @chat.id.to_s,
          created_by: @created_by,
          priority: "medium"
        }.merge(@attributes.compact)
      )
    end

    private

    def contact_name
      @chat.display_name.presence ||
        @chat.user_name.presence ||
        @chat.contact_storage.to_h["name"].presence ||
        @chat.phone_number.presence ||
        I18n.t("pipelines.cards.unnamed_contact")
    end

    def description
      parts = []
      parts << I18n.t("pipelines.cards.chat_description.contact", value: @chat.user_name) if @chat.user_name.present?
      parts << I18n.t("pipelines.cards.chat_description.phone", value: @chat.phone_number) if @chat.phone_number.present?
      parts << I18n.t("pipelines.cards.chat_description.status", value: @chat.status) if @chat.status.present?
      parts.join("\n")
    end
  end
end
