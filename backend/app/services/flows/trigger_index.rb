module Flows
  # Quais gatilhos a organização tem publicados, em cache. É consultado a cada mensagem e a cada conversa criada, e a
  # organização sem fluxo nem chega a tocar na tabela.
  module TriggerIndex
    TTL = 5.minutes
    MESSAGE_TRIGGERS = %w[message_received first_message keyword].freeze

    module_function

    def active?(organization_id, trigger_type)
      types(organization_id).include?(trigger_type.to_s)
    end

    def message_flows?(organization_id)
      types(organization_id).intersect?(MESSAGE_TRIGGERS)
    end

    def types(organization_id)
      Rails.cache.fetch(key(organization_id), expires_in: TTL) do
        Flow.published.for_organization(organization_id).distinct.pluck(:trigger_type)
      end
    end

    def bust(organization_id)
      Rails.cache.delete(key(organization_id))
    end

    def key(organization_id)
      "flows.triggers.#{organization_id}"
    end
    private_class_method :key
  end
end
