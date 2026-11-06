module Pipelines
  class StageChecklistItemSerializer < ApplicationSerializer
    def self.one(item)
      {
        id: item.id,
        stageId: item.stage_id,
        title: item.title,
        position: item.position,
        required: item.required,
        createdAt: epoch_ms(item.created_at),
        updatedAt: epoch_ms(item.updated_at)
      }
    end

    # O item visto de um card: marcado ou não, e por quem.
    def self.check(item, check)
      {
        id: item.id,
        title: item.title,
        position: item.position,
        required: item.required,
        completed: check&.completed || false,
        completedAt: epoch_ms(check&.completed_at),
        completedById: check&.completed_by_id
      }
    end
  end
end
