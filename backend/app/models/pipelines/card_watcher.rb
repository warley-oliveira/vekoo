module Pipelines
  class CardWatcher < ApplicationRecord
    belongs_to :card, class_name: "Pipelines::Card", inverse_of: :watchers
    belongs_to :account

    validates :account_id, uniqueness: { scope: :card_id }
  end
end
