# A conversa como o quadro do funil a mostra: o que cabe num card, sem `customAttributes`, que podem
# ser grandes e multiplicariam o peso de uma agregação que já traz várias colunas numa resposta só.
class FunnelChatSerializer < ApplicationSerializer
  # @param accounts [Hash] id => nome, já buscados em lote
  # @param tags [Hash] id => ChatTag, já buscadas em lote
  def self.one(chat, funnel_id:, accounts: {}, tags: {})
    {
      id: chat.id.to_s,
      connectorId: chat.connector_id&.to_s,
      externalId: chat.external_id,
      phoneNumber: chat.phone_number,
      userName: chat.user_name,
      displayName: chat.display_name,
      profilePictureUrl: chat.profile_picture_url,
      status: chat.status,
      automationEnabled: chat.automation_enabled,
      assignedAccountId: chat.assigned_account_id,
      assignedAccountName: accounts[chat.assigned_account_id],
      teamId: chat.team_id,
      unreadMessages: chat.unread_messages,
      activeSession: chat.active_session,
      summary: chat.summary,
      notes: chat.notes,
      lastMessageAt: epoch_ms(chat.last_message_at),
      lastMessageType: chat.last_message_type,
      lastMessageBy: chat.last_message_by,
      lastMessageContent: chat.last_message_content,
      stageId: chat.funnel_stage_id(funnel_id),
      chatTags: Array(chat.chat_tag_ids).filter_map { |id| tags[id] }.map { |tag| { id: tag.id.to_s, name: tag.name, color: tag.color } },
      createdAt: epoch_ms(chat.created_at)
    }
  end
end
