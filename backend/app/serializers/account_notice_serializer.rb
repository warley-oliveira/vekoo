# Mesmos `id`, `key`, `at` e `read` do aviso do produto (`NotificationSerializer`), mais o
# que só este tem: a lista unificada mistura os dois e a tela trata cada item pelo `key`.
#
# `url` e `actions[].urlPath` saem com o prefixo do vínculo de quem recebe (`/a/<hashid>/...`):
# o gravado é o caminho puro, e o prefixo é de quem lê (`AccountLink`).
class AccountNoticeSerializer < ApplicationSerializer
  def self.one(notice, account: Current.account)
    account = nil unless account&.id.to_s == notice.account_id.to_s
    {
      id: notice.id.to_s,
      key: nil,
      at: epoch_ms(notice.created_at),
      read: notice.read?,
      title: notice.title,
      description: notice.description,
      url: AccountLink.path(account, notice.url),
      category: notice.category,
      actions: account ? AccountLink.actions(account, notice.actions) : notice.actions,
      readAt: epoch_ms(notice.read_at),
      archivedAt: epoch_ms(notice.archived_at)
    }
  end
end
