# Tempo real da lista de conversas: quem vê o quê sai da permissão `chat_list_to`. Quem vê
# tudo escuta a stream principal; os demais, só a do departamento (ou a própria) mais a das
# conversas sem dono. As streams são as de `Chat#list_streams`.
class ChatListChannel < ApplicationCable::Channel
  RECENT_LIMIT = 30

  def subscribed
    return reject unless current_account.can?(:chat)

    case chat_list_permission
    when "team", "department"
      current_account.team_ids.each { |id| stream_from organization_stream("chat-list-team-#{id}") }
      stream_from organization_stream("chat-list-unassigned")
    when "assigned"
      stream_from organization_stream("chat-list-account-#{current_account.id}")
      stream_from organization_stream("chat-list-unassigned")
    when "all"
      stream_from organization_stream("chat-list")
    else
      reject
    end
  rescue StandardError => e
    Rails.logger.error(e.full_message)
    reject
  end

  def unsubscribed
    stop_all_streams
  end

  # As conversas mais recentes, sem refazer a lista inteira (ao reconectar, por exemplo).
  def request_recent(_data = {})
    transmit({ action: "recent_chats", events: ChatSerializer.many(recent_chats) })
  end

  private

  def chat_list_permission
    current_account.permission_level(:chat_list_to)
  end

  def recent_chats
    scope = Chat.where(organization_id: current_organization.id).valid_records.order_by(last_message_at: :desc)

    case chat_list_permission
    when "team", "department"
      scope = scope.where(:team_id.in => current_account.team_ids + [ nil ])
    when "assigned"
      scope = scope.where(
        "$or" => [
          { assigned_account_id: current_account.id },
          { assigned_account_id: nil, team_id: nil }
        ]
      )
    when "all"
      # tudo
    else
      return []
    end

    scope.limit(RECENT_LIMIT).to_a
  end
end
