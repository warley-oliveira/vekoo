class NotificationSerializer < ApplicationSerializer
  # `key` é a chave de tradução (`notifications.<key>.title|body`) — o texto é
  # interface e nasce na tela.
  def self.one(notification)
    {
      id: notification.id,
      key: notification.key,
      at: epoch_ms(notification.notified_at),
      read: notification.read
    }
  end
end
