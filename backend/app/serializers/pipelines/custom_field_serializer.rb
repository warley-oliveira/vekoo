module Pipelines
  class CustomFieldSerializer < ApplicationSerializer
    def self.one(field)
      {
        id: field.id,
        key: field.key,
        name: field.name,
        fieldType: field.field_type,
        position: field.position,
        required: field.required,
        options: field.options,
        defaultValue: field.default_value,
        scope: field.scope,
        stageId: field.stage_id,
        requiredToLeaveStage: field.required_to_leave_stage
      }
    end
  end
end
