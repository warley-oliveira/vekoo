module Pipelines
  # Validador da estrutura de um filtro salvo. Devolve a lista de mensagens de erro (vazia = válido).
  # Compartilhado por `SavedFilter` (422 ao salvar) e `CardQuery` (422 ao executar).
  #
  # Formato:
  #   { "version" => 1,
  #     "all" => [ { "field" => "priority", "operator" => "eq", "value" => "high" } ],
  #     "any" => [ ... ] }
  class FilterDefinition
    VERSION = 1

    VALUELESS_OPERATORS = %w[is_empty is_not_empty].freeze
    ARRAY_OPERATORS = %w[in nin between contains_any contains_all].freeze
    RANGE_OPERATORS = %w[within not_within].freeze
    POINT_OPERATORS = %w[before after].freeze
    # Sem teto, uma definição enorme viraria um SQL enorme a cada abertura do quadro.
    MAX_CONDITIONS = 50

    def self.validate(definition, board:)
      new(definition, board: board).validate
    end

    def initialize(definition, board:)
      @definition = coerce(definition)
      @registry = FieldRegistry.new(board)
    end

    def validate
      return [ message(:not_an_object) ] unless @definition.is_a?(Hash)

      errors = []
      errors << message(:version, version: VERSION) unless @definition["version"].to_i == VERSION

      all = @definition["all"]
      any = @definition["any"]
      errors << message(:group_not_a_list, group: "all") unless all.nil? || all.is_a?(Array)
      errors << message(:group_not_a_list, group: "any") unless any.nil? || any.is_a?(Array)
      return errors if errors.any?

      conditions = Array(all) + Array(any)
      return errors << message(:no_conditions) if conditions.empty?
      return errors << message(:too_many_conditions, count: MAX_CONDITIONS) if conditions.size > MAX_CONDITIONS

      conditions.each_with_index { |condition, index| errors.concat(validate_condition(condition, index)) }
      errors
    end

    private

    def coerce(definition)
      definition.respond_to?(:to_unsafe_h) ? definition.to_unsafe_h : definition
    end

    def message(key, **options)
      I18n.t("pipelines.filters.errors.#{key}", **options)
    end

    def validate_condition(condition, index)
      position = index + 1
      return [ message(:condition_not_an_object, position: position) ] unless condition.is_a?(Hash)

      field = @registry.field_for(condition["field"])
      return [ message(:unknown_field, position: position, field: condition["field"]) ] if field.nil?

      operator = condition["operator"].to_s
      unless @registry.operator_allowed?(field, operator)
        return [ message(:operator_not_allowed, position: position, operator: operator, field: condition["field"]) ]
      end

      validate_value(position, field, operator, condition["value"])
    end

    def validate_value(position, field, operator, value)
      return [] if VALUELESS_OPERATORS.include?(operator)
      return [ message(:value_required, position: position) ] if value.nil?

      if ARRAY_OPERATORS.include?(operator)
        return [ message(:value_not_a_list, position: position) ] unless value.is_a?(Array)
        return [ message(:value_list_empty, position: position) ] if value.empty?
        return [ message(:between_needs_two, position: position) ] if operator == "between" && value.size != 2
      elsif value.is_a?(Array) && !RANGE_OPERATORS.include?(operator) && !array_field?(field)
        # Um array onde cabe um valor só viraria SQL inválido (`coluna = 1,2`): 500 em vez de 422.
        return [ message(:value_not_single, position: position) ]
      end

      return validate_token_value(position, field, operator, value) if value.is_a?(Hash)
      return [ message(:value_not_a_number, position: position) ] if field.type == "number" && !numeric_values?(value)
      return [ message(:value_not_an_id, position: position) ] if @registry.uuid_values?(field) && !uuid_values?(value)

      allowed = @registry.allowed_values_for(field.key)
      return [ message(:value_not_allowed, position: position, values: allowed.join(", ")) ] if allowed && !Array(value).all? { |item| allowed.include?(item.to_s) }

      []
    end

    def array_field?(field)
      %w[array labels].include?(field.type)
    end

    def numeric_values?(value)
      Array(value).all? { |item| item.is_a?(Numeric) || Float(item.to_s, exception: false) }
    end

    # `{ "type": "me" }` também vale dentro da lista de um `in`.
    def uuid_values?(value)
      Array(value).all? { |item| (item.is_a?(Hash) && item["type"] == "me") || Pipelines.uuid?(item) }
    end

    def validate_token_value(position, field, operator, value)
      case value["type"]
      when "relative" then validate_relative_token(position, operator, value)
      when "me"
        return [ message(:me_only_for_people, position: position) ] unless field.type == "user"

        []
      else
        [ message(:unknown_token, position: position, type: value["type"]) ]
      end
    end

    def validate_relative_token(position, operator, value)
      token = value["token"]

      if RANGE_OPERATORS.include?(operator)
        return [ message(:invalid_relative_token, position: position, token: token) ] unless RelativeDate.range_token?(token)
      elsif POINT_OPERATORS.include?(operator)
        return [ message(:invalid_relative_token, position: position, token: token) ] unless RelativeDate.point_token?(token)
      else
        return [ message(:relative_not_allowed, position: position, operator: operator) ]
      end

      if RelativeDate.parameterized?(token)
        amount = Integer(value["n"], exception: false)
        return [ message(:token_needs_amount, position: position, token: token) ] if amount.nil? || amount <= 0
      end

      []
    end
  end
end
