module Pipelines
  class SavedFilter < ApplicationRecord
    VISIBILITIES = %w[private shared].freeze

    belongs_to :organization
    belongs_to :board, class_name: "Pipelines::Board", inverse_of: :saved_filters
    belongs_to :owner, class_name: "Account", foreign_key: :account_id, optional: true

    has_many :favorites, class_name: "Pipelines::SavedFilterFavorite", foreign_key: :pipeline_saved_filter_id,
      inverse_of: :saved_filter, dependent: :destroy

    validates :name, presence: true, length: { maximum: 100 }
    validates :visibility, inclusion: { in: VISIBILITIES }
    validate :board_belongs_to_organization
    validate :definition_is_valid

    scope :for_board, ->(board) { where(board_id: board.id) }
    scope :visible_to, lambda { |account|
      where(visibility: "shared").or(where(visibility: "private", account_id: account&.id))
    }

    def owned_by?(account)
      account_id.present? && account_id == account&.id
    end

    private

    def definition_is_valid
      return if board.nil?

      FilterDefinition.validate(definition, board: board).each { |message| errors.add(:definition, message) }
    end

    def board_belongs_to_organization
      return if board.nil? || board.organization_id == organization_id

      errors.add(:board_id, :invalid)
    end
  end
end
