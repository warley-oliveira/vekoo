# Visão salva do chat: um conjunto de filtros com nome (origem: ChatFilter). Pessoal só a
# dona enxerga; compartilhada, a organização inteira.
class ChatView < ApplicationRecord
  belongs_to :organization
  belongs_to :account

  scope :visible_to, lambda { |account|
    where(organization_id: account.organization_id)
      .where("chat_views.personal = FALSE OR chat_views.account_id = ?", account.id)
  }

  validates :name, presence: true, length: { maximum: 120 }
  validate :account_belongs_to_organization

  private

  def account_belongs_to_organization
    return if account.nil? || account.organization_id == organization_id

    errors.add(:account_id, :invalid)
  end
end
