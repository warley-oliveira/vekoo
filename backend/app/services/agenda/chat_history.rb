module Agenda
  # O que da conversa entra no pedido de geração: as últimas mensagens de texto, do contato e do
  # nosso lado. A origem mandava o histórico inteiro, que numa conversa antiga custa caro e não
  # ajuda a escrever um lembrete.
  module ChatHistory
    LIMIT = 30
    CANDIDATES_LIMIT = 50
    MAX_CHARS = 1_000

    module_function

    # @param message_ids [Array<String>, nil] restringe às escolhidas. `[]` é "sem histórico", e
    #   nil é o histórico normal.
    # @return [Array<Hash>] { role:, content: }, da mais antiga para a mais nova
    def for(chat, message_ids: nil)
      return [] if message_ids&.empty?

      scope = ChatMessage::Base.unscoped.where(chat_id: chat.id, :role.in => ChatMessage::Base::REAL_ROLES, is_span: false)
      scope = scope.where(:_id.in => object_ids(message_ids)) if message_ids

      scope.order_by(created_at: :desc).limit(LIMIT).pluck(:role, :content).reverse.filter_map do |role, content|
        { role: role, content: content.to_s.truncate(MAX_CHARS) } if content.present?
      end
    end

    # As mensagens que a tela de simulação oferece, da mais antiga para a mais nova: as mesmas que
    # entrariam no pedido, com o id para escolher.
    #
    # @return [Array<Hash>] { id:, role:, content:, createdAt: }
    def candidates(chat, limit: nil)
      size = (limit.presence || CANDIDATES_LIMIT).to_i.clamp(1, CANDIDATES_LIMIT)

      ChatMessage::Base.unscoped
                       .where(chat_id: chat.id, :role.in => ChatMessage::Base::REAL_ROLES, is_span: false, tool_calls: nil)
                       .order_by(created_at: :desc)
                       .limit(size)
                       .pluck(:id, :role, :content, :created_at)
                       .reverse
                       .filter_map do |id, role, content, created_at|
        next if content.blank?

        { id: id.to_s, role: role, content: content.to_s.truncate(MAX_CHARS), createdAt: ApplicationSerializer.epoch_ms(created_at) }
      end
    end

    def object_ids(ids)
      ids.filter_map { |id| BSON::ObjectId.from_string(id.to_s) if BSON::ObjectId.legal?(id.to_s) }
    end
  end
end
