module Agenda
  # Os nomes dos campos personalizados. `CustomField` é do domínio inbox: sem ele, quem chama fica
  # com a chave crua no lugar do nome.
  module CustomFieldLabels
    module_function

    # @return [Hash] { chave => nome }
    def for(organization_id, keys)
      return {} if keys.blank? || !defined?(::CustomField)

      ::CustomField.where(organization_id: organization_id.to_s, :key.in => keys.map(&:to_s)).to_h { |field| [ field.key, field.name ] }
    end
  end
end
