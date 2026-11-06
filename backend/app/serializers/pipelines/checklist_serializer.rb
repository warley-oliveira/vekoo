module Pipelines
  class ChecklistSerializer < ApplicationSerializer
    def self.one(checklist)
      {
        id: checklist.id,
        name: checklist.name,
        position: checklist.position,
        items: checklist.items.map { |item| item_json(item) },
        createdAt: epoch_ms(checklist.created_at),
        updatedAt: epoch_ms(checklist.updated_at)
      }
    end

    def self.item_json(item)
      {
        id: item.id,
        title: item.title,
        completed: item.completed,
        position: item.position,
        assignedToId: item.assigned_to_id,
        createdAt: epoch_ms(item.created_at),
        updatedAt: epoch_ms(item.updated_at)
      }
    end
  end
end
