class FunnelSerializer < ApplicationSerializer
  def self.one(funnel)
    {
      id: funnel.id,
      name: funnel.name,
      description: funnel.description,
      stages: funnel.stages.map { |stage| { id: stage.id, name: stage.name, position: stage.position } },
      createdAt: epoch_ms(funnel.created_at),
      updatedAt: epoch_ms(funnel.updated_at)
    }
  end
end
