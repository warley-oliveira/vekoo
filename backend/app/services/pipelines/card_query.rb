module Pipelines
  # Traduz uma definição de filtro (grupos AND/OR de condições campo/operador/valor) em uma relation
  # de `Pipelines::Card`.
  #
  # Semântica: (all₁ AND all₂ …) AND (any₁ OR any₂ …).
  #
  # Cada condição compila para uma relation `Card.where(...)` autocontida (subconsultas via EXISTS/IN,
  # nunca joins): assim o grupo `any` é combinável com `.or` sem erro de incompatibilidade estrutural,
  # e o `merge` preserva o `includes` de quem chamou.
  #
  # Segurança: nomes de coluna vêm sempre de `FieldRegistry` ou de chaves de campo validadas por regex;
  # valores entram sempre como bind.
  class CardQuery
    class InvalidDefinitionError < StandardError
      attr_reader :details

      def initialize(details)
        @details = Array(details)
        super(@details.join("; "))
      end
    end

    CUSTOM_KEY_FORMAT = /\A[a-z0-9_]+\z/
    # Guardas antes de converter o texto do jsonb para número ou data. Passadas como bind (não
    # interpoladas) porque o quantificador `?` colidiria com o placeholder do Active Record.
    NUMERIC_REGEX = '^-?[0-9]+(\.[0-9]+)?$'
    DATE_REGEX = "^[0-9]{4}-[0-9]{2}-[0-9]{2}"

    def self.call(board:, definition:, current_account: nil, base_scope: nil)
      new(board: board, definition: definition, current_account: current_account, base_scope: base_scope).call
    end

    def initialize(board:, definition:, current_account: nil, base_scope: nil)
      @board = board
      @definition = coerce(definition)
      @current_account = current_account
      @base_scope = base_scope
      @registry = FieldRegistry.new(board)
    end

    # @return [ActiveRecord::Relation<Pipelines::Card>]
    def call
      errors = FilterDefinition.validate(@definition, board: @board)
      raise InvalidDefinitionError, errors if errors.any?

      scope = @base_scope || @board.cards.active
      scope = all_conditions.reduce(scope) { |current, condition| current.merge(relation_for(condition)) }
      scope = scope.merge(any_relation) if any_conditions.any?
      scope
    end

    private

    def coerce(definition)
      definition.respond_to?(:to_unsafe_h) ? definition.to_unsafe_h : definition
    end

    def all_conditions
      Array(@definition["all"])
    end

    def any_conditions
      Array(@definition["any"])
    end

    def any_relation
      any_conditions.map { |condition| relation_for(condition) }.reduce(:or)
    end

    def relation_for(condition)
      field = @registry.field_for(condition["field"])
      operator = condition["operator"].to_s
      value = condition["value"]

      if field.builder
        send("build_#{field.builder}", operator, value)
      elsif field.custom_key
        build_custom(field, operator, value)
      else
        build_native(field, operator, value)
      end
    end

    # — Colunas nativas ———————————————————————————
    def build_native(field, operator, value)
      column = field.sql_column
      case field.type
      when "text" then text_condition(column, operator, value)
      when "number" then number_condition(column, operator, value)
      when "date" then date_condition(column, operator, value)
      when "select" then select_condition(column, operator, value)
      when "user" then user_condition(column, operator, resolve_user_value(value))
      when "array" then array_condition(column, operator, value)
      else Card.all
      end
    end

    def text_condition(column, operator, value)
      case operator
      when "eq" then where("#{column} = ?", value.to_s)
      when "ne" then where("#{column} IS DISTINCT FROM ?", value.to_s)
      when "contains" then where("#{column} ILIKE ?", "%#{like(value)}%")
      when "not_contains" then where("#{column} NOT ILIKE ? OR #{column} IS NULL", "%#{like(value)}%")
      when "starts_with" then where("#{column} ILIKE ?", "#{like(value)}%")
      when "not_starts_with" then where("#{column} NOT ILIKE ? OR #{column} IS NULL", "#{like(value)}%")
      when "is_empty" then where("#{column} IS NULL OR #{column} = ''")
      when "is_not_empty" then where("#{column} IS NOT NULL AND #{column} <> ''")
      end
    end

    def number_condition(column, operator, value)
      case operator
      when "eq" then where("#{column} = ?", value)
      when "ne" then where("#{column} IS DISTINCT FROM ?", value)
      when "gt" then where("#{column} > ?", value)
      when "gte" then where("#{column} >= ?", value)
      when "lt" then where("#{column} < ?", value)
      when "lte" then where("#{column} <= ?", value)
      when "between" then where("#{column} BETWEEN ? AND ?", value[0], value[1])
      when "is_empty" then where("#{column} IS NULL")
      when "is_not_empty" then where("#{column} IS NOT NULL")
      end
    end

    def date_condition(column, operator, value)
      case operator
      when "eq"
        day = parse_date(value)
        where("#{column} BETWEEN ? AND ?", day.in_time_zone.beginning_of_day, day.in_time_zone.end_of_day)
      when "before" then where("#{column} < ?", resolve_date_point(value))
      when "after" then where("#{column} > ?", resolve_date_point(value))
      when "between" then where("#{column} BETWEEN ? AND ?", parse_time(value[0]), parse_time(value[1]))
      when "within"
        range = resolve_date_range(value)
        where("#{column} BETWEEN ? AND ?", range.begin, range.end)
      when "not_within"
        range = resolve_date_range(value)
        where("#{column} < ? OR #{column} > ? OR #{column} IS NULL", range.begin, range.end)
      when "is_empty" then where("#{column} IS NULL")
      when "is_not_empty" then where("#{column} IS NOT NULL")
      end
    end

    def select_condition(column, operator, value)
      case operator
      when "eq" then where("#{column} = ?", value.to_s)
      when "ne" then where("#{column} IS DISTINCT FROM ?", value.to_s)
      when "in" then where("#{column} IN (?)", Array(value).map(&:to_s))
      when "nin" then where("#{column} NOT IN (?) OR #{column} IS NULL", Array(value).map(&:to_s))
      when "is_empty" then where("#{column} IS NULL OR #{column} = ''")
      when "is_not_empty" then where("#{column} IS NOT NULL AND #{column} <> ''")
      end
    end

    def user_condition(column, operator, value)
      case operator
      when "eq" then where("#{column} = ?", value)
      when "ne" then where("#{column} IS DISTINCT FROM ?", value)
      when "in" then where("#{column} IN (?)", Array(value))
      when "nin" then where("#{column} NOT IN (?) OR #{column} IS NULL", Array(value))
      when "is_empty" then where("#{column} IS NULL")
      when "is_not_empty" then where("#{column} IS NOT NULL")
      end
    end

    def array_condition(column, operator, value)
      case operator
      when "contains_any" then where("#{column} && ARRAY[?]::varchar[]", Array(value).map(&:to_s))
      when "contains_all" then where("#{column} @> ARRAY[?]::varchar[]", Array(value).map(&:to_s))
      when "not_contains" then where("NOT (#{column} && ARRAY[?]::varchar[])", Array(value).map(&:to_s))
      when "is_empty" then where("#{column} = '{}'")
      when "is_not_empty" then where("#{column} <> '{}'")
      end
    end

    # — Campos personalizados (jsonb custom_field_values) ————————
    def build_custom(field, operator, value)
      accessor = jsonb_accessor(field.custom_key)
      case field.type
      when "number" then custom_number(accessor, operator, value)
      when "date" then custom_date(accessor, operator, value)
      when "checkbox" then custom_checkbox(accessor, operator, value)
      when "user" then custom_text(accessor, operator, resolve_user_value(value))
      else custom_text(accessor, operator, value)
      end
    end

    def custom_text(accessor, operator, value)
      case operator
      when "eq" then where("#{accessor} = ?", value.to_s)
      when "ne" then where("#{accessor} IS DISTINCT FROM ?", value.to_s)
      when "contains" then where("#{accessor} ILIKE ?", "%#{like(value)}%")
      when "not_contains" then where("#{accessor} NOT ILIKE ? OR #{accessor} IS NULL", "%#{like(value)}%")
      when "starts_with" then where("#{accessor} ILIKE ?", "#{like(value)}%")
      when "not_starts_with" then where("#{accessor} NOT ILIKE ? OR #{accessor} IS NULL", "#{like(value)}%")
      when "in" then where("#{accessor} IN (?)", Array(value).map(&:to_s))
      when "nin" then where("#{accessor} NOT IN (?) OR #{accessor} IS NULL", Array(value).map(&:to_s))
      when "is_empty" then where(custom_blank_sql(accessor))
      when "is_not_empty" then where("NOT (#{custom_blank_sql(accessor)})")
      end
    end

    def custom_number(accessor, operator, value)
      number = "(#{accessor})::numeric"
      guarded = "#{accessor} ~ ? AND #{number}"
      case operator
      when "eq" then where("#{guarded} = ?", NUMERIC_REGEX, value)
      when "ne" then where("#{accessor} IS NULL OR NOT (#{accessor} ~ ? AND #{number} = ?)", NUMERIC_REGEX, value)
      when "gt" then where("#{guarded} > ?", NUMERIC_REGEX, value)
      when "gte" then where("#{guarded} >= ?", NUMERIC_REGEX, value)
      when "lt" then where("#{guarded} < ?", NUMERIC_REGEX, value)
      when "lte" then where("#{guarded} <= ?", NUMERIC_REGEX, value)
      when "between" then where("#{accessor} ~ ? AND #{number} BETWEEN ? AND ?", NUMERIC_REGEX, value[0], value[1])
      when "is_empty" then where(custom_blank_sql(accessor))
      when "is_not_empty" then where("NOT (#{custom_blank_sql(accessor)})")
      end
    end

    def custom_date(accessor, operator, value)
      casted = "(#{accessor})::date"
      guarded = "#{accessor} ~ ? AND #{casted}"
      case operator
      when "eq" then where("#{guarded} = ?", DATE_REGEX, parse_date(value))
      when "before" then where("#{guarded} < ?", DATE_REGEX, resolve_date_point(value).to_date)
      when "after" then where("#{guarded} > ?", DATE_REGEX, resolve_date_point(value).to_date)
      when "between"
        where("#{guarded} BETWEEN ? AND ?", DATE_REGEX, parse_date(value[0]), parse_date(value[1]))
      when "within"
        range = resolve_date_range(value)
        where("#{guarded} BETWEEN ? AND ?", DATE_REGEX, range.begin.to_date, range.end.to_date)
      when "not_within"
        range = resolve_date_range(value)
        where("#{accessor} IS NULL OR NOT (#{accessor} ~ ? AND #{casted} BETWEEN ? AND ?)",
          DATE_REGEX, range.begin.to_date, range.end.to_date)
      when "is_empty" then where(custom_blank_sql(accessor))
      when "is_not_empty" then where("NOT (#{custom_blank_sql(accessor)})")
      end
    end

    # `eq false` casa também com a caixa nunca respondida, porque é isso que a pessoa entende por
    # "desmarcado". Já `is_empty` casa só com o não respondido: 'false' é uma resposta, não um vazio,
    # o mesmo corte de `CustomFieldValue`.
    def custom_checkbox(accessor, operator, value)
      case operator
      when "is_empty" then where(custom_blank_sql(accessor))
      when "is_not_empty" then where("NOT (#{custom_blank_sql(accessor)})")
      else
        if truthy?(value)
          where("#{accessor} IN ('true','t','1')")
        else
          where("#{accessor} IS NULL OR #{accessor} IN ('false','f','0','')")
        end
      end
    end

    # — Campos virtuais ———————————————————————————
    def build_stage(operator, value)
      column = "pipeline_cards.stage_id"
      case operator
      when "eq" then where("#{column} = ?", value)
      when "ne" then where("#{column} IS DISTINCT FROM ?", value)
      when "in" then where("#{column} IN (?)", Array(value))
      when "nin" then where("#{column} NOT IN (?)", Array(value))
      when "is_empty" then false_relation
      when "is_not_empty" then true_relation
      end
    end

    def build_labels(operator, value)
      ids = Array(value).map(&:to_s)
      exists = "EXISTS (SELECT 1 FROM pipeline_card_labels pcl " \
               "WHERE pcl.card_id = pipeline_cards.id AND pcl.label_id IN (?))"
      any_labels = "EXISTS (SELECT 1 FROM pipeline_card_labels pcl WHERE pcl.card_id = pipeline_cards.id)"

      case operator
      when "contains_any" then where(exists, ids)
      when "not_contains" then where("NOT #{exists}", ids)
      when "contains_all"
        where(
          "(SELECT COUNT(DISTINCT pcl.label_id) FROM pipeline_card_labels pcl " \
          "WHERE pcl.card_id = pipeline_cards.id AND pcl.label_id IN (?)) = ?",
          ids, ids.uniq.size
        )
      when "is_empty" then where("NOT #{any_labels}")
      when "is_not_empty" then where(any_labels)
      end
    end

    def build_deal_status(operator, value)
      clauses = Array(value).filter_map { |status| deal_status_sql(status) }
      return false_relation if clauses.empty?

      positive = where(clauses.map { |clause| "(#{clause})" }.join(" OR "))
      %w[ne nin].include?(operator) ? negate(positive) : positive
    end

    def build_rotting(_operator, value)
      rotting_days = @board.deal_rotting_days
      return truthy?(value) ? false_relation : true_relation if rotting_days.nil? || rotting_days <= 0

      positive = where(
        "pipeline_cards.won_at IS NULL AND pipeline_cards.lost_at IS NULL AND pipeline_cards.stage_entered_at < ?",
        rotting_days.days.ago
      )
      toggle(positive, value)
    end

    def build_first_stage(_operator, value)
      positive = where(
        "pipeline_cards.stage_id = (SELECT id FROM pipeline_stages WHERE board_id = ? ORDER BY position ASC LIMIT 1)",
        @board.id
      )
      toggle(positive, value)
    end

    def build_deactivated_assignee(_operator, value)
      positive = where(
        "pipeline_cards.assigned_to_id IS NOT NULL AND NOT EXISTS " \
        "(SELECT 1 FROM accounts WHERE accounts.id = pipeline_cards.assigned_to_id " \
        "AND accounts.organization_id = ? AND accounts.revoked_at IS NULL)",
        @board.organization_id
      )
      toggle(positive, value)
    end

    DEAL_STATUS_SQL = {
      "open" => "pipeline_cards.won_at IS NULL AND pipeline_cards.lost_at IS NULL",
      "won" => "pipeline_cards.won_at IS NOT NULL",
      "lost" => "pipeline_cards.lost_at IS NOT NULL"
    }.freeze

    def deal_status_sql(status)
      DEAL_STATUS_SQL[status.to_s]
    end

    # — Apoio ——————————————————————————————————
    def where(*args)
      Card.where(*args)
    end

    def toggle(positive, value)
      truthy?(value) ? positive : negate(positive)
    end

    # A subconsulta fica presa às etapas do quadro: sem isso, ela varreria os cards de todas as
    # organizações para descobrir quais NÃO são deste quadro.
    def negate(relation)
      where(
        "pipeline_cards.id NOT IN (?)",
        relation.where(stage_id: @board.stages.unscope(:order).select(:id)).reorder(nil).select(:id)
      )
    end

    def false_relation
      where("1 = 0")
    end

    def true_relation
      where("1 = 1")
    end

    def like(value)
      Card.sanitize_sql_like(value.to_s)
    end

    def truthy?(value)
      [ true, "true", "t", 1, "1" ].include?(value)
    end

    # Espelho SQL de `CustomFieldValue.blank_value?`: chave ausente, JSON null, texto em branco, lista
    # e objeto vazios contam como vazio. `false` e `0` não: são respostas.
    def custom_blank_sql(accessor)
      "COALESCE(btrim(#{accessor}), '') IN ('', '[]', '{}')"
    end

    def jsonb_accessor(key)
      unless key.to_s.match?(CUSTOM_KEY_FORMAT)
        raise InvalidDefinitionError, I18n.t("pipelines.filters.errors.invalid_custom_key", key: key)
      end

      "pipeline_cards.custom_field_values ->> '#{key}'"
    end

    def resolve_user_value(value)
      if value.is_a?(Hash) && value["type"] == "me"
        raise InvalidDefinitionError, I18n.t("pipelines.filters.errors.me_needs_account") if @current_account.nil?

        @current_account.id
      elsif value.is_a?(Array)
        value.map { |item| resolve_user_value(item) }
      else
        value
      end
    end

    def resolve_date_point(value)
      if relative?(value)
        RelativeDate.point(value["token"], amount: value["n"])
      else
        parse_time(value)
      end
    end

    def resolve_date_range(value)
      if relative?(value)
        RelativeDate.range(value["token"], amount: value["n"])
      elsif value.is_a?(Array) && value.size == 2
        parse_time(value[0])..parse_time(value[1])
      else
        raise InvalidDefinitionError, I18n.t("pipelines.filters.errors.invalid_range", value: value.inspect)
      end
    end

    def relative?(value)
      value.is_a?(Hash) && value["type"] == "relative"
    end

    def parse_date(value)
      Date.parse(value.to_s)
    rescue ArgumentError, TypeError
      raise InvalidDefinitionError, I18n.t("pipelines.filters.errors.invalid_date", value: value.inspect)
    end

    def parse_time(value)
      (Time.zone || ActiveSupport::TimeZone["UTC"]).parse(value.to_s) ||
        raise(InvalidDefinitionError, I18n.t("pipelines.filters.errors.invalid_date", value: value.inspect))
    rescue ArgumentError, TypeError
      raise InvalidDefinitionError, I18n.t("pipelines.filters.errors.invalid_date", value: value.inspect)
    end
  end
end
