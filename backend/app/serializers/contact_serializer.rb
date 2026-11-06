# Uma linha da lista de contatos. Contato aqui é a conversa (ver `Contact`): o que muda em relação a
# ChatSerializer é que vem com o nome e o tipo do canal, e dos mapas livres só os campos
# personalizados, que viram coluna na tela.
class ContactSerializer < ApplicationSerializer
  # Os campos que esta linha lê: a lista só busca estes.
  FIELDS = %i[
    _id automation_enabled user_name display_name external_id assigned_account_id team_id
    profile_picture_url last_message_at last_message_type last_message_by last_message_content
    status notes created_at unread_messages session_start_at connector_id chat_tag_ids
    custom_attributes
  ].freeze

  def self.one(chat, connector: nil)
    {
      id: chat.id.to_s,
      userName: chat.user_name,
      displayName: chat.display_name,
      externalId: chat.external_id,
      phoneNumber: chat.phone_number,
      profilePictureUrl: chat.profile_picture_url,
      lastMessageAt: epoch_ms(chat.last_message_at),
      lastMessageFrom: chat.last_message_at && chat.last_message_from,
      lastMessageType: chat.last_message_type,
      lastMessageBy: chat.last_message_by,
      lastMessageContent: chat.last_message_content,
      status: chat.status,
      automationEnabled: chat.automation_enabled,
      assignedAccountId: chat.assigned_account_id,
      teamId: chat.team_id,
      connectorId: chat.connector_id&.to_s,
      connectorName: connector&.display_name,
      connectorType: connector&.connector_type,
      tagIds: Array(chat.chat_tag_ids).map(&:to_s),
      activeSession: chat.active_session,
      createdAt: epoch_ms(chat.created_at),
      unreadMessages: chat.unread_messages,
      notes: chat.notes,
      customAttributes: chat.custom_attributes || {}
    }
  end
end
