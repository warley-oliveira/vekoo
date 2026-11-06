class CustomFieldSerializer < ApplicationSerializer
  def self.one(custom_field)
    {
      id: custom_field.id.to_s,
      name: custom_field.name,
      key: custom_field.key,
      description: custom_field.description,
      valueType: custom_field.value_type,
      defaultValue: custom_field.default_value,
      optionValues: custom_field.option_values,
      autoNormalize: custom_field.auto_normalize,
      normalizationStrategy: custom_field.normalization_strategy,
      normalizationTargetKey: custom_field.normalization_target_key,
      createdAt: epoch_ms(custom_field.created_at),
      updatedAt: epoch_ms(custom_field.updated_at)
    }
  end
end
