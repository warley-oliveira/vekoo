module Pipelines
  # Item do checklist da etapa: o que precisa estar marcado para o card avançar (na origem,
  # `KanbanColumnChecklistItem`).
  class StageChecklistItem < ApplicationRecord
    include Pipelines::OrderedList

    belongs_to :stage, class_name: "Pipelines::Stage", inverse_of: :checklist_items
    has_many :card_checks, class_name: "Pipelines::CardStageCheck", foreign_key: :pipeline_stage_checklist_item_id,
      inverse_of: :checklist_item, dependent: :destroy

    ordered_within :stage_id

    validates :title, presence: true, length: { maximum: 500 }
    validates :position, numericality: Pipelines::INTEGER_RANGE, allow_nil: true
  end
end
