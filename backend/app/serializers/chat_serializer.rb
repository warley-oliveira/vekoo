# A conversa como a lista e os canais de tempo real enxergam. O mesmo formato sai em
# `ChatListChannel` e é o ponto de partida da API de listagem (domínio inbox).
class ChatSerializer < ApplicationSerializer
  def self.one(chat)
    {
      id: chat.id.to_s,
      connectorId: chat.connector_id&.to_s,
      audienceId: chat.audience_id&.to_s,
      externalId: chat.external_id,
      phoneNumber: chat.phone_number,
      userName: chat.user_name,
      displayName: chat.display_name,
      abbreviatedName: chat.abbreviated_name,
      audienceType: chat.audience_type,
      audienceUserName: chat.audience_user_name,
      profilePictureUrl: chat.profile_picture_url,
      status: chat.status,
      automationEnabled: chat.automation_enabled,
      automationResumeAt: epoch_ms(chat.automation_resume_at),
      assignedAccountId: chat.assigned_account_id,
      teamId: chat.team_id,
      unreadMessages: chat.unread_messages,
      senderPhoneNumberId: chat.sender_phone_number_id&.to_s,
      sessionStartAt: epoch_ms(chat.session_start_at),
      activeSession: chat.active_session,
      lastMessageAt: epoch_ms(chat.last_message_at),
      lastMessageFrom: chat.last_message_at && chat.last_message_from,
      lastMessageType: chat.last_message_type,
      lastMessageBy: chat.last_message_by,
      lastMessageContent: chat.last_message_content,
      notes: chat.notes,
      tagIds: Array(chat.chat_tag_ids).map(&:to_s),
      customAttributes: chat.custom_attributes,
      funnelStages: chat.funnel_stages,
      createdAt: epoch_ms(chat.created_at),
      updatedAt: epoch_ms(chat.updated_at)
    }
  end
end
