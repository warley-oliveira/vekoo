# O segredo de assinatura e o texto cifrado dele nunca saem daqui. A dica é só para reconhecer a chave.
class HookSerializer < ApplicationSerializer
  # `headers` e `body` são da pessoa, e mapa livre não vira camelCase.
  OPAQUE_CONFIG = %w[headers body].freeze

  def self.one(hook)
    {
      id: hook.id,
      uid: hook.uid,
      name: hook.name,
      slug: hook.slug,
      status: hook.status,
      totalRequest: hook.total_request,
      url: url_for(hook),
      receivedPayload: hook.last_payload_fields,
      signatureEnabled: hook.signature_enabled,
      signingSecretHint: hook.signing_secret_hint,
      signingSecretGeneratedAt: epoch_ms(hook.signing_secret_generated_at),
      webhookActions: hook.hook_actions.map { |action| action_entry(action) },
      createdAt: epoch_ms(hook.created_at),
      updatedAt: epoch_ms(hook.updated_at)
    }
  end

  def self.action_entry(action)
    {
      id: action.id,
      type: action.type,
      static: action.static?,
      config: config_of(action),
      createdAt: epoch_ms(action.created_at),
      updatedAt: epoch_ms(action.updated_at)
    }
  end

  def self.config_of(action)
    action.config.to_h.each_with_object({}) do |(key, value), result|
      value = SecretHeaders.mask(value) if key.to_s == "headers"
      result[key.to_s.camelize(:lower)] = OPAQUE_CONFIG.include?(key.to_s) ? value : camelized(value)
    end
  end
  private_class_method :config_of

  def self.camelized(value)
    case value
    when Hash then value.deep_transform_keys { |key| key.to_s.camelize(:lower) }
    when Array then value.map { |item| camelized(item) }
    else value
    end
  end
  private_class_method :camelized

  def self.url_for(hook)
    base = ENV["BACKEND_URL"].to_s.delete_suffix("/")
    "#{base}/inbound/webhooks/#{hook.uid}"
  end
  private_class_method :url_for
end
