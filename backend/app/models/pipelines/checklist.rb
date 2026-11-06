module Pipelines
  class Checklist < ApplicationRecord
    include Pipelines::OrderedList

    belongs_to :card, class_name: "Pipelines::Card", inverse_of: :checklists
    has_many :items, class_name: "Pipelines::ChecklistItem", foreign_key: :pipeline_checklist_id, inverse_of: :checklist,
      dependent: :destroy

    ordered_within :card_id

    validates :name, presence: true, length: { maximum: 255 }
    validates :position, numericality: Pipelines::POSITIVE_INTEGER, allow_nil: true

    # Depois de qualquer mudança no checklist, o quadro precisa do progresso novo do card.
    after_commit :broadcast_card_progress

    def progress
      total = items.count
      completed = items.where(completed: true).count
      { completed: completed, total: total }
    end

    private

    def broadcast_card_progress
      card&.broadcast_progress_change unless destroyed_by_association
    end
  end
end
