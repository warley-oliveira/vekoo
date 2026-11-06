module Pipelines
  # Os campos filtráveis de um card.
  #
  # Nenhum nome de campo vindo de fora chega ao SQL: só os descritores daqui (colunas nativas) ou a
  # `key` da definição de um campo personalizado, que tem formato controlado.
  class FieldRegistry
    Field = Struct.new(:key, :type, :sql_column, :custom_key, :builder, keyword_init: true)

    # Campos nativos: mapeiam direto para colunas de pipeline_cards.
    NATIVE_FIELDS = {
      "title" => { type: "text", sql_column: "pipeline_cards.title" },
      "description" => { type: "text", sql_column: "pipeline_cards.description" },
      "status" => { type: "text", sql_column: "pipeline_cards.status" },
      "company_name" => { type: "text", sql_column: "pipeline_cards.company_name" },
      "contact_email" => { type: "text", sql_column: "pipeline_cards.contact_email" },
      "contact_phone" => { type: "text", sql_column: "pipeline_cards.contact_phone" },
      "lost_reason" => { type: "text", sql_column: "pipeline_cards.lost_reason" },
      "color_label" => { type: "text", sql_column: "pipeline_cards.color_label" },
      "priority" => { type: "select", sql_column: "pipeline_cards.priority" },
      "deal_value" => { type: "number", sql_column: "pipeline_cards.deal_value" },
      "deal_probability" => { type: "number", sql_column: "pipeline_cards.deal_probability" },
      "due_date" => { type: "date", sql_column: "pipeline_cards.due_date" },
      "expected_close_date" => { type: "date", sql_column: "pipeline_cards.expected_close_date" },
      "created_at" => { type: "date", sql_column: "pipeline_cards.created_at" },
      "updated_at" => { type: "date", sql_column: "pipeline_cards.updated_at" },
      "won_at" => { type: "date", sql_column: "pipeline_cards.won_at" },
      "lost_at" => { type: "date", sql_column: "pipeline_cards.lost_at" },
      "completed_at" => { type: "date", sql_column: "pipeline_cards.completed_at" },
      "stage_entered_at" => { type: "date", sql_column: "pipeline_cards.stage_entered_at" },
      "assigned_to_id" => { type: "user", sql_column: "pipeline_cards.assigned_to_id" },
      "created_by_id" => { type: "user", sql_column: "pipeline_cards.created_by_id" },
      "tags" => { type: "array", sql_column: "pipeline_cards.tags" }
    }.freeze

    # Campos virtuais: resolvidos por um construtor próprio em CardQuery.
    VIRTUAL_FIELDS = {
      "stage_id" => { type: "select", builder: :stage, uuid_values: true },
      "label_ids" => { type: "labels", builder: :labels, uuid_values: true },
      "deal_status" => { type: "select", builder: :deal_status, allowed_values: %w[open won lost] },
      "is_rotting" => { type: "virtual_bool", builder: :rotting },
      "in_first_stage" => { type: "virtual_bool", builder: :first_stage },
      "assigned_to_deactivated" => { type: "virtual_bool", builder: :deactivated_assignee }
    }.freeze

    OPERATORS_BY_TYPE = {
      "text" => %w[eq ne contains not_contains starts_with not_starts_with is_empty is_not_empty],
      "number" => %w[eq ne gt gte lt lte between is_empty is_not_empty],
      "date" => %w[eq before after between within not_within is_empty is_not_empty],
      "select" => %w[eq ne in nin is_empty is_not_empty],
      "user" => %w[eq ne in nin is_empty is_not_empty],
      "checkbox" => %w[eq is_empty is_not_empty],
      "array" => %w[contains_any contains_all not_contains is_empty is_not_empty],
      "labels" => %w[contains_any contains_all not_contains is_empty is_not_empty],
      "virtual_bool" => %w[eq]
    }.freeze

    # field_type da definição do campo -> tipo interno daqui.
    CUSTOM_TYPE_MAP = {
      "text" => "text",
      "url" => "text",
      "number" => "number",
      "date" => "date",
      "select" => "select",
      "checkbox" => "checkbox",
      "user" => "user"
    }.freeze

    def initialize(board)
      @board = board
    end

    # @return [Field, nil] o descritor do campo, ou nil se desconhecido
    def field_for(name)
      name = name.to_s
      if name.start_with?("custom.")
        custom_field_for(name.delete_prefix("custom."))
      elsif NATIVE_FIELDS.key?(name)
        config = NATIVE_FIELDS.fetch(name)
        Field.new(key: name, type: config[:type], sql_column: config[:sql_column])
      elsif VIRTUAL_FIELDS.key?(name)
        config = VIRTUAL_FIELDS.fetch(name)
        Field.new(key: name, type: config[:type], builder: config[:builder])
      end
    end

    def operator_allowed?(field, operator)
      OPERATORS_BY_TYPE.fetch(field.type, []).include?(operator.to_s)
    end

    # Valores permitidos para selects virtuais (ex.: deal_status).
    def allowed_values_for(name)
      VIRTUAL_FIELDS.dig(name.to_s, :allowed_values)
    end

    # O valor vai comparar com uma coluna uuid: fora do formato, o Postgres levanta erro de sintaxe.
    def uuid_values?(field)
      VIRTUAL_FIELDS.dig(field.key, :uuid_values) || (field.type == "user" && field.custom_key.nil?)
    end

    private

    def custom_field_for(key)
      definition = custom_definitions[key.to_s]
      return nil unless definition

      type = CUSTOM_TYPE_MAP[definition.field_type]
      return nil unless type

      # `custom_key` é sempre a chave que veio do banco.
      Field.new(key: "custom.#{definition.key}", type: type, custom_key: definition.key)
    end

    def custom_definitions
      @custom_definitions ||= @board.custom_fields.index_by(&:key)
    end
  end
end
