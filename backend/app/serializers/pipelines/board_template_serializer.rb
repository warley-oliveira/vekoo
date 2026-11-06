module Pipelines
  class BoardTemplateSerializer < ApplicationSerializer
    def self.one(template)
      {
        id: template.id,
        name: template.name,
        description: template.description,
        templateKey: template.template_key,
        icon: template.icon,
        color: template.color,
        defaultBoardType: template.default_board_type,
        stagesConfig: camel_list(template.stages_config),
        customFieldsConfig: camel_list(template.custom_fields_config)
      }
    end

    def self.camel_list(list)
      Array(list).map { |item| item.transform_keys { |key| key.to_s.camelize(:lower) } }
    end
    private_class_method :camel_list
  end
end
