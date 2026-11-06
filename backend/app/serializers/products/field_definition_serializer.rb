module Products
  class FieldDefinitionSerializer < ApplicationSerializer
    def self.one(definition)
      {
        id: definition.id,
        name: definition.name,
        key: definition.key,
        description: definition.description,
        valueType: definition.value_type,
        optionValues: definition.option_values,
        defaultValue: definition.default_value,
        required: definition.required,
        searchable: definition.searchable,
        position: definition.position,
        createdAt: epoch_ms(definition.created_at),
        updatedAt: epoch_ms(definition.updated_at)
      }
    end
  end
end
