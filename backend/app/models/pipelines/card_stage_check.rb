module Pipelines
  # Item do checklist da etapa marcado num card (na origem, `KanbanCardColumnCheck`).
  class CardStageCheck < ApplicationRecord
    belongs_to :card, class_name: "Pipelines::Card", inverse_of: :stage_checks
    belongs_to :checklist_item, class_name: "Pipelines::StageChecklistItem",
      foreign_key: :pipeline_stage_checklist_item_id, inverse_of: :card_checks
    belongs_to :completed_by, class_name: "Account", optional: true

    validates :pipeline_stage_checklist_item_id, uniqueness: { scope: :card_id }

    def toggle!(account = nil)
      completed_now = !completed
      update!(
        completed: completed_now,
        completed_at: completed_now ? Time.current : nil,
        completed_by_id: completed_now ? account&.id : nil
      )
    end
  end
end
