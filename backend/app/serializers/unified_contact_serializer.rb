# Uma linha da lista de contatos unificados, a partir do documento bruto da agregação.
class UnifiedContactSerializer < ApplicationSerializer
  def self.one(row)
    {
      externalId: row["external_id"],
      audienceId: row["audience_id"]&.to_s,
      name: row["display_name"].presence || row["user_name"],
      profilePictureUrl: row["profile_picture_url"],
      totalUnread: row["total_unread"] || 0,
      matchCount: row["match_count"],
      lastMessageAt: epoch_ms(row["last_message_at"]),
      lastMessageContent: row["last_message_content"],
      lastMessageBy: row["last_message_by"],
      lastMessageType: row["last_message_type"],
      chats: chats(row["chats"])
    }
  end

  # As conversas que casaram primeiro; dentro de cada grupo, a mais recente antes. É a aba que a tela
  # abre com filtro ativo.
  def self.chats(rows)
    list = Array(rows).map do |chat|
      {
        chatId: chat["chat_id"]&.to_s,
        connectorId: chat["connector_id"]&.to_s,
        unread: chat["unread"] || 0,
        lastMessageAt: epoch_ms(chat["last_message_at"]),
        senderPhoneNumberId: chat["sender_phone_number_id"]&.to_s,
        audienceType: chat["audience_type"],
        status: chat["status"],
        matched: chat["matched"] != false
      }
    end

    list.sort_by { |chat| [ chat[:matched] ? 0 : 1, -(chat[:lastMessageAt] || 0) ] }
  end
end
