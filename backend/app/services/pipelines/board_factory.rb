module Pipelines
  class BoardFactory
    def self.create_blank(name:, organization:, description: nil, color: nil, icon: nil, board_type: "standard")
      board = organization.pipeline_boards.build(
        name: name,
        description: description,
        color: color,
        icon: icon,
        board_type: board_type
      )

      ActiveRecord::Base.transaction do
        board.save!
        default_stage_names(board_type).each { |stage_name| board.stages.create!(name: stage_name) }
      end

      board
    end

    def self.create_from_template(template_key:, organization:, name: nil, board_type: nil)
      BoardTemplate.ensure_defaults!
      template = BoardTemplate.find_by!(template_key: template_key)

      board = organization.pipeline_boards.build(
        name: name.presence || template.name,
        description: template.description,
        color: template.color,
        icon: template.icon,
        template_key: template_key,
        board_type: board_type.presence || template.default_board_type.presence || "standard"
      )

      ActiveRecord::Base.transaction do
        board.save!

        # As posições do modelo são a ordem de leitura. A lista numera sozinha, a partir de 1.
        template.stages_config.sort_by { |config| config["position"].to_i }.each do |config|
          board.stages.create!(name: config["name"], color: config["color"])
        end

        template.custom_fields_config.each do |config|
          board.custom_fields.create!(
            name: config["name"],
            field_type: config["field_type"],
            required: config["required"] || false,
            options: config["options"],
            default_value: config["default_value"]
          )
        end

        template.triggers_config.each do |config|
          board.triggers.create!(
            name: config["name"],
            event_type: config["event_type"],
            conditions: config["conditions"] || {},
            actions: config["actions"] || []
          )
        end

        apply_lead_scoring(board) if template_key == "lead_scoring"
      end

      board
    end

    def self.default_stage_names(board_type)
      I18n.t("pipelines.board_factory.#{board_type == 'crm' ? 'crm_stages' : 'default_stages'}")
    end
    private_class_method :default_stage_names

    def self.apply_lead_scoring(board)
      score = board.custom_fields.where(field_type: "number").find { |field| field.key == "lead_score" }

      board.update!(lead_score_field_key: score&.key, lead_score_low: 30, lead_score_high: 70)
    end
    private_class_method :apply_lead_scoring
  end
end
