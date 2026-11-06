module Pipelines
  class LabelSerializer < ApplicationSerializer
    def self.one(label)
      {
        id: label.id,
        name: label.name,
        color: label.color,
        createdAt: epoch_ms(label.created_at),
        updatedAt: epoch_ms(label.updated_at)
      }
    end

    # O que vai dentro do card.
    def self.brief(label)
      { id: label.id, name: label.name, color: label.color }
    end
  end
end
