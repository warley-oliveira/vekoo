module Pipelines
  class TriggerSerializer < ApplicationSerializer
    # @param viewer [Account] o código de `run_code` pode conter segredo, e escrevê-lo é de quem tem
    #   acesso aos fluxos (ver TriggersController): sem esse acesso, a ação vem sem o texto.
    def self.one(trigger, viewer:)
      reads_code = viewer.can?(:flows)

      {
        id: trigger.id,
        name: trigger.name,
        eventType: trigger.event_type,
        conditions: camel_keys(trigger.conditions),
        actions: Array(trigger.actions).map { |action| camel_keys(masked_headers(reads_code ? action : without_code(action))) },
        active: trigger.active,
        stageId: trigger.stage_id,
        createdAt: epoch_ms(trigger.created_at),
        updatedAt: epoch_ms(trigger.updated_at)
      }
    end

    def self.many(triggers, viewer:)
      triggers.map { |trigger| one(trigger, viewer: viewer) }
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

    # O valor sai para ninguém: quem tem só `pipelines` lia a chave de quem configurou o gatilho.
    def self.masked_headers(action)
      action.is_a?(Hash) && action["headers"].present? ? action.merge("headers" => SecretHeaders.mask(action["headers"])) : action
    end
    private_class_method :masked_headers

    def self.without_code(action)
      action.is_a?(Hash) ? action.reject { |key, _value| key.to_s == "code" } : action
    end
    private_class_method :without_code

    # Só o primeiro nível: o que vem por baixo das chaves conhecidas é dado do usuário
    # (`Trigger::OPAQUE_ACTION_KEYS`) ou `{ operator, value }`, que não muda.
    def self.camel_keys(hash)
      return {} unless hash.is_a?(Hash)

      hash.transform_keys { |key| key.to_s.camelize(:lower) }
    end
    private_class_method :camel_keys
  end
end
