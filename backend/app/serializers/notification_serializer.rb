class NotificationSerializer < ApplicationSerializer
  # `key` é a chave de tradução (`notifications.<key>.title|body`) — o texto é
  # interface e nasce na tela.
  #
  # A lista unificada traz também o `AccountNotice`, que tem texto pronto e `key: null`.
  # É o `key` que diz à tela qual dos dois ela tem na mão.
  def self.one(notification)
    return AccountNoticeSerializer.one(notification) if notification.is_a?(AccountNotice)

    {
      id: notification.id,
      key: notification.key,
      at: epoch_ms(notification.notified_at),
      read: notification.read
    }
  end
end
