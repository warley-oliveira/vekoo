module Pipelines
  class StageSerializer < ApplicationSerializer
    def self.one(stage)
      {
        id: stage.id,
        boardId: stage.board_id,
        name: stage.name,
        position: stage.position,
        color: stage.color,
        wipLimit: stage.wip_limit,
        slaHours: stage.sla_hours
      }
    end
  end
end
