# Avisos da pessoa em tempo real. A stream é por pessoa, dentro da organização da
# sessão: não há id nenhum para trocar no `subscribe`.
#
#   { channel: "NotificationsChannel" }
#
# Ao assinar e sempre que o total muda (ler, ler tudo, tirar da lista):
#
#   { unreadCount: 3 }
#
# Quando nasce um aviso:
#
#   { notification: { …mesmo formato de GET /notifications… }, unreadCount: 4 }
class NotificationsChannel < ApplicationCable::Channel
  def subscribed
    stream_from self.class.account_stream(current_account.organization_id, current_account.id)
    transmit({ unreadCount: Notifications::Feed.unread_count(current_account) })
  end

  def unsubscribed
    stop_all_streams
  end

  def self.account_stream(organization_id, account_id)
    organization_stream(organization_id, "notifications:#{account_id}")
  end

  def self.broadcast_notice(notice)
    account = Account.find_by(id: notice.account_id)
    return unless account

    ActionCable.server.broadcast(
      account_stream(notice.organization_id, notice.account_id),
      { notification: AccountNoticeSerializer.one(notice, account: account), unreadCount: Notifications::Feed.unread_count(account) }
    )
  end

  def self.broadcast_unread(account)
    ActionCable.server.broadcast(
      account_stream(account.organization_id, account.id),
      { unreadCount: Notifications::Feed.unread_count(account) }
    )
  end
end
