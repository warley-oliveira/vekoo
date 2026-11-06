module Pipelines
  class ActivitySerializer < ApplicationSerializer
    # `details` tem chaves conhecidas, escritas por nós (`from_stage_id`, `old_value`): saem em
    # camelCase como o resto. O que muda de atividade para atividade está no contrato.
    def self.one(activity)
      {
        id: activity.id,
        action: activity.action,
        details: activity.details.to_h.transform_keys { |key| key.to_s.camelize(:lower) },
        createdAt: epoch_ms(activity.created_at),
        user: PersonPayload.json(activity.user)
      }
    end
  end
end
