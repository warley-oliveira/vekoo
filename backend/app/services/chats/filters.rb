module Chats
  # Os filtros avançados do chat. A mesma condição vira duas coisas:
  #
  #   * `Filters.query(conditions)`: um filtro de consulta, para a lista de conversas;
  #   * `Filters.expression(conditions)`: uma expressão booleana de agregação, para os contatos
  #     unificados marcarem cada conversa como `matched` em vez de descartá-la.
  #
  # Qualquer operador novo precisa nascer nos dois: o mesmo filtro serve às duas listas.
  #
  # Regras que não mudam com o tempo:
  #
  #   * **Só entram os campos desta lista.** Na origem a chave era texto livre, e dava para
  #     filtrar por `organization_id` ou mandar `$where`.
  #   * **`collection.aggregate` usa o driver bruto, sem a coerção do Mongoid.** Por isso os
  #     valores são convertidos aqui: um ObjectId em texto "nunca casa", em silêncio.
  #   * **`custom_attributes` são texto no Mongo.** Número só compara convertendo na hora, e por
  #     isso a condição carrega `value_type`.
  #   * Condição inválida (operador desconhecido, data que não é data) é ignorada, sem derrubar
  #     as outras e sem virar 500. Cada condição carrega o próprio `query_operator`: derivá-lo da
  #     lista original desalinhava todos os and/or seguintes assim que uma caía.
  module Filters
    DATE_FIELDS = %w[created_at last_message_at].freeze
    ARRAY_FIELDS = %w[chat_tag_ids].freeze
    OBJECT_ID_FIELDS = %w[connector_id chat_tag_ids audience_id].freeze
    INTEGER_FIELDS = %w[unread_messages sender_phone_number_id].freeze
    BOOLEAN_FIELDS = %w[automation_enabled].freeze
    STRING_FIELDS = %w[
      status audience_type last_message_by last_message_type assigned_account_id team_id
      external_id user_name display_name notes contact_origin origin_entry_point
    ].freeze
    KNOWN_FIELDS = (DATE_FIELDS + OBJECT_ID_FIELDS + INTEGER_FIELDS + BOOLEAN_FIELDS + STRING_FIELDS).freeze

    # O serializer chama a lista de `tagIds`: a tela pode usar o mesmo nome.
    ALIASES = { "tag_ids" => "chat_tag_ids" }.freeze

    CUSTOM_PREFIX = "custom_attributes.".freeze
    # O resto do caminho é dado da pessoa: sem ponto nem `$`, para não escapar do mapa.
    CUSTOM_KEY = /\A[\p{L}\p{N}_\-]+\z/

    NO_VALUE_OPERATORS = %w[is_set is_empty].freeze

    Condition = Struct.new(:key, :operator, :values, :value_type, :query_operator, keyword_init: true) do
      def field = "$#{key}"
      def custom? = key.start_with?(CUSTOM_PREFIX)
      def numeric_custom? = custom? && value_type == "number"
      def date? = DATE_FIELDS.include?(key)
      def array? = ARRAY_FIELDS.include?(key)
      def first_value = values.first
    end

    module_function

    # @param raw [Array, Hash, ActionController::Parameters, nil] `filters[0][attributeKey]=...`
    #   (lista em forma de mapa, na query) ou a lista de um corpo JSON, já em snake_case
    # @return [Array<Condition>] só as condições sobre campos conhecidos
    def conditions(raw)
      entries(raw).filter_map { |entry| build_condition(entry) }
    end

    # @return [Hash] filtro de consulta; vazio se nenhuma condição sobrou
    def query(conditions, time_zone: Time.zone)
      Query.new(time_zone).build(conditions)
    end

    # @return [Hash, nil] expressão de agregação; nil se nenhuma condição sobrou
    def expression(conditions, time_zone: Time.zone)
      Expression.new(time_zone).build(conditions)
    end

    def entries(raw)
      raw = raw.to_unsafe_h if raw.respond_to?(:to_unsafe_h)
      list = raw.is_a?(Hash) ? raw.values : Array(raw)

      list.filter_map do |entry|
        entry = entry.to_unsafe_h if entry.respond_to?(:to_unsafe_h)
        entry.with_indifferent_access if entry.is_a?(Hash)
      end
    end

    def build_condition(entry)
      key = normalize_key(entry[:attribute_key])
      operator = entry[:filter_operator].to_s
      return nil if key.nil? || operator.blank?

      # Valor só escalar: um hash aqui viraria operador do Mongo.
      values = Array(entry[:values]).flatten.reject { |value| value.is_a?(Hash) || value.is_a?(Array) }
      values = values.reject(&:blank?) unless NO_VALUE_OPERATORS.include?(operator)
      return nil if values.empty? && !NO_VALUE_OPERATORS.include?(operator)

      Condition.new(
        key: key,
        operator: operator,
        values: values,
        value_type: entry[:value_type].to_s,
        query_operator: entry[:query_operator].to_s
      )
    end

    def normalize_key(raw)
      key = raw.to_s
      if (custom_key = key.delete_prefix(CUSTOM_PREFIX)) != key || (custom_key = key.delete_prefix("customAttributes.")) != key
        return custom_key.match?(CUSTOM_KEY) ? "#{CUSTOM_PREFIX}#{custom_key}" : nil
      end

      key = key.underscore
      key = ALIASES.fetch(key, key)
      KNOWN_FIELDS.include?(key) ? key : nil
    end

    # --- conversões, comuns às duas saídas -------------------------------------

    def cast_values(condition)
      if OBJECT_ID_FIELDS.include?(condition.key)
        condition.values.filter_map { |value| cast_object_id(value) }
      elsif INTEGER_FIELDS.include?(condition.key)
        condition.values.map { |value| value.to_s.to_i }
      elsif BOOLEAN_FIELDS.include?(condition.key)
        condition.values.map { |value| value.to_s == "true" }
      else
        condition.values.map(&:to_s)
      end
    end

    def cast_object_id(value)
      BSON::ObjectId.from_string(value.to_s)
    rescue BSON::Error::InvalidObjectId
      nil
    end

    # O valor de uma comparação por `>`/`<`, no tipo gravado.
    # @raise [ArgumentError] data ou número que não fazem sentido
    def comparison_value(condition, time_zone)
      value = condition.first_value.to_s

      if condition.date?
        time_zone.parse(value) || raise(ArgumentError, "data inválida")
      elsif condition.numeric_custom?
        Float(value.tr(",", "."))
      elsif INTEGER_FIELDS.include?(condition.key)
        Integer(value, 10)
      else
        value
      end
    end

    # O dia inteiro, no fuso da organização. Só `Date.parse` daria o dia em UTC.
    def day_range(condition, time_zone)
      day = Date.parse(condition.first_value.to_s).in_time_zone(time_zone)
      [ day.beginning_of_day, day.end_of_day ]
    end

    def to_double(field)
      { "$convert" => { "input" => field, "to" => "double", "onError" => nil, "onNull" => nil } }
    end

    # `$lt` entre nulo e número dá verdadeiro: sem esta guarda, "idade < 30" traria quem nem tem o
    # campo preenchido. `$gt` com nulo é falso tanto para nulo quanto para campo ausente.
    def numeric_comparison(mongo_operator, field, number)
      double = to_double(field)
      { "$and" => [ { "$gt" => [ double, nil ] }, { mongo_operator => [ double, number ] } ] }
    end

    def combine(entries, or_key: "$or", and_key: "$and")
      entries.drop(1).reduce(entries.first.first) do |result, (expression, query_operator)|
        query_operator == "or" ? { or_key => [ result, expression ] } : { and_key => [ result, expression ] }
      end
    end

    # A condição como filtro de consulta.
    class Query
      def initialize(time_zone)
        @time_zone = time_zone
      end

      def build(conditions)
        entries = conditions.filter_map do |condition|
          query = translate(condition)
          [ query, condition.query_operator ] if query
        end
        return {} if entries.empty?

        Filters.combine(entries)
      end

      private

      def translate(condition)
        key = condition.key

        case condition.operator
        when "equal_to"
          return nil if condition.values.include?("all")

          if condition.date?
            first, last = Filters.day_range(condition, @time_zone)
            { key => { "$gte" => first, "$lte" => last } }
          else
            membership(condition, "$in")
          end
        when "contains"
          membership(condition, "$in")
        when "not_equal_to", "not_contains"
          membership(condition, "$nin")
        when "text_contains"
          { key => { "$regex" => Regexp.escape(condition.first_value.to_s), "$options" => "i" } }
        when "is_set"
          { key => { "$nin" => empty_values(condition) } }
        when "is_empty"
          { key => { "$in" => empty_values(condition) } }
        when "is_less_than"
          range(condition, "$lt")
        when "is_greater_than"
          range(condition, "$gt")
        end
      rescue ArgumentError, TypeError
        nil
      end

      def membership(condition, mongo_operator)
        casted = Filters.cast_values(condition)
        return nil if casted.empty?

        { condition.key => { mongo_operator => casted } }
      end

      # Campo ausente também conta como vazio: é o que o `$in` com nulo cobre.
      def empty_values(condition)
        condition.array? ? [ nil, [] ] : [ nil, "" ]
      end

      # `$expr` é o único caminho para converter texto em número dentro de uma consulta.
      def range(condition, mongo_operator)
        value = Filters.comparison_value(condition, @time_zone)
        return { "$expr" => Filters.numeric_comparison(mongo_operator, condition.field, value) } if condition.numeric_custom?

        { condition.key => { mongo_operator => value } }
      end
    end

    # A condição como expressão booleana de agregação (`$addFields { matched }`).
    class Expression
      def initialize(time_zone)
        @time_zone = time_zone
      end

      def build(conditions)
        entries = conditions.filter_map do |condition|
          expression = translate(condition)
          [ expression, condition.query_operator ] if expression
        end
        return nil if entries.empty?

        Filters.combine(entries)
      end

      private

      def translate(condition)
        field = condition.field

        case condition.operator
        when "equal_to"
          return nil if condition.values.include?("all")

          if condition.date?
            first, last = Filters.day_range(condition, @time_zone)
            { "$and" => [ { "$gte" => [ field, first ] }, { "$lte" => [ field, last ] } ] }
          else
            membership(condition)
          end
        when "contains"
          membership(condition)
        when "not_equal_to", "not_contains"
          inner = membership(condition)
          inner && { "$not" => [ inner ] }
        when "text_contains"
          {
            "$regexMatch" => {
              # Valor que não é texto (mapa de sistema, número gravado por fluxo) faria o
              # $regexMatch derrubar a agregação inteira.
              "input" => { "$convert" => { "input" => field, "to" => "string", "onError" => "", "onNull" => "" } },
              "regex" => Regexp.escape(condition.first_value.to_s),
              "options" => "i"
            }
          }
        when "is_set"
          present(condition)
        when "is_empty"
          { "$not" => [ present(condition) ] }
        when "is_less_than"
          range(condition, "$lt")
        when "is_greater_than"
          range(condition, "$gt")
        end
      rescue ArgumentError, TypeError
        nil
      end

      # "Qualquer um": lista por interseção, escalar por `$in`.
      def membership(condition)
        casted = Filters.cast_values(condition)
        return nil if casted.empty?

        if condition.array?
          { "$gt" => [ { "$size" => { "$setIntersection" => [ { "$ifNull" => [ condition.field, [] ] }, casted ] } }, 0 ] }
        else
          { "$in" => [ condition.field, casted ] }
        end
      end

      # Na agregação campo ausente é diferente de nulo: `$ne: [campo, null]` daria verdadeiro para
      # quem nem tem o campo. O `$ifNull` junta os dois casos antes de comparar.
      def present(condition)
        return { "$gt" => [ { "$size" => { "$ifNull" => [ condition.field, [] ] } }, 0 ] } if condition.array?

        { "$ne" => [ { "$ifNull" => [ condition.field, "" ] }, "" ] }
      end

      def range(condition, mongo_operator)
        value = Filters.comparison_value(condition, @time_zone)
        return Filters.numeric_comparison(mongo_operator, condition.field, value) if condition.numeric_custom?

        # Mesmo motivo de `numeric_comparison`: campo ausente é menor que qualquer valor.
        { "$and" => [ { "$gt" => [ condition.field, nil ] }, { mongo_operator => [ condition.field, value ] } ] }
      end
    end
  end
end
