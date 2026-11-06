# Mesmos `id`, `key`, `at` e `read` do aviso do produto (`NotificationSerializer`), mais o
# que só este tem: a lista unificada mistura os dois e a tela trata cada item pelo `key`.
class AccountNoticeSerializer < ApplicationSerializer
  def self.one(notice)
    {
      id: notice.id.to_s,
      key: nil,
      at: epoch_ms(notice.created_at),
      read: notice.read?,
      title: notice.title,
      description: notice.description,
      url: notice.url,
      category: notice.category,
      actions: notice.actions,
      readAt: epoch_ms(notice.read_at),
      archivedAt: epoch_ms(notice.archived_at)
    }
  end
end
