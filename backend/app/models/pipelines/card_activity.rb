module Pipelines
  class CardActivity < ApplicationRecord
    # `auto_archived` não estava na lista da origem: o job de auto-arquivamento tentava gravá-la, a
    # validação recusava, e o erro ia só para o log. `label_*` também não tinham quem gravasse.
    ACTIONS = %w[
      created moved updated assigned commented label_added label_removed
      deal_won deal_lost deal_reopened archived auto_archived
    ].freeze

    belongs_to :card, class_name: "Pipelines::Card", inverse_of: :activities
    belongs_to :user, class_name: "Account", foreign_key: :account_id, optional: true

    validates :action, presence: true, inclusion: { in: ACTIONS }

    default_scope { order(created_at: :desc) }

    scope :for_card, ->(card_id) { where(card_id: card_id) }
    scope :recent, ->(limit = 50) { limit(limit) }
  end
end
