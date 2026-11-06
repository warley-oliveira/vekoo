module Pipelines
  # O resumo da conversa que aparece no card, em nome de uma pessoa: só o que ela pode ver
  # (`Chat.visible_to`, a mesma regra do chat). Sem a pessoa, não há resumo: é o caso das transmissões,
  # que vão para todo mundo no quadro.
  module ChatSummary
    module_function

    # @return [Hash{String => Hash}] resumo por id de conversa
    def for_account(account, chat_ids, detailed: false)
      ids = Array(chat_ids).compact.uniq.filter_map { |id| BSON::ObjectId.from_string(id) if BSON::ObjectId.legal?(id) }
      return {} if account.nil? || ids.empty?

      Chat.visible_to(account).where(:_id.in => ids).to_a.to_h do |chat|
        [ chat.id.to_s, detailed ? detailed_json(chat) : json(chat) ]
      end
    end

    def json(chat)
      {
        id: chat.id.to_s,
        contactName: chat.display_name.presence || chat.user_name.presence || chat.contact_storage.to_h["name"],
        contactPhone: chat.phone_number,
        profilePictureUrl: chat.profile_picture_url,
        status: chat.status,
        lastMessageAt: ApplicationSerializer.epoch_ms(chat.last_message_at)
      }
    end

    # O que alimenta o compositor de mensagens no card: sem isto, quem atende digita fora da janela de
    # 24 horas e a mensagem falha em silêncio.
    def detailed_json(chat)
      json(chat).merge(
        connectorId: chat.connector_id&.to_s,
        connectorType: chat.connector&._type,
        activeSession: chat.active_session?
      )
    end
  end
end
