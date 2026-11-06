module Pipelines
  class TriggerSerializer < ApplicationSerializer
    def self.one(trigger)
      {
        id: trigger.id,
        name: trigger.name,
        eventType: trigger.event_type,
        conditions: camel_keys(trigger.conditions),
        actions: Array(trigger.actions).map { |action| camel_keys(action) },
        active: trigger.active,
        stageId: trigger.stage_id,
        createdAt: epoch_ms(trigger.created_at),
        updatedAt: epoch_ms(trigger.updated_at)
      }
    end

    def self.execution(execution)
      {
        id: execution.id,
        triggerId: execution.pipeline_trigger_id,
        cardId: execution.card_id,
        status: execution.status,
        executedActions: Array(execution.executed_actions).map { |action| camel_keys(action) },
        errorMessage: execution.error_message,
        executedAt: epoch_ms(execution.executed_at),
        triggerName: execution.trigger&.name,
        cardTitle: execution.card&.title
      }
    end

    # Só o primeiro nível: o que vem por baixo das chaves conhecidas é dado do usuário
    # (`Trigger::OPAQUE_ACTION_KEYS`) ou `{ operator, value }`, que não muda.
    def self.camel_keys(hash)
      return {} unless hash.is_a?(Hash)

      hash.transform_keys { |key| key.to_s.camelize(:lower) }
    end
    private_class_method :camel_keys
  end
end
