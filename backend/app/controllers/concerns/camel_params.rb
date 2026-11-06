# O front fala camelCase; o Ruby fala snake_case. Esta conversão acontece uma vez,
# na entrada, para nenhum controlador precisar saber da diferença.
#
# Mapas livres (definição de fluxo, atributos personalizados…) têm chaves que são
# dados do usuário e passam intactos. Um controlador acrescenta as suas com:
#
#   self.opaque_params += %w[payload]
module CamelParams
  extend ActiveSupport::Concern

  DEFAULT_OPAQUE = %w[
    definition custom_attributes custom_fields field_values flow_data contact_storage
    external_fields metadata components headers variables
  ].freeze

  included do
    class_attribute :opaque_params, default: DEFAULT_OPAQUE
    before_action :underscore_params
  end

  private

  def underscore_params
    self.params = ActionController::Parameters.new(underscore_keys(request.parameters))
  end

  def underscore_keys(value)
    case value
    when Hash
      value.each_with_object({}) do |(key, inner), result|
        snake = key.to_s.underscore
        result[snake] = opaque_params.include?(snake) ? inner : underscore_keys(inner)
      end
    when Array
      value.map { |inner| underscore_keys(inner) }
    else
      value
    end
  end
end
