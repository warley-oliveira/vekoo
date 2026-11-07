# frozen_string_literal: true

module CustomDashboards
  module QueryBuilders
    # Gera a consulta Active Record a partir da consulta já conferida por `QueryEngine`.
    #
    # Nada que veio do cliente entra no texto do SQL. O campo só chega aqui se está na lista da fonte, e
    # vai citado pelo adaptador; os valores vão por Arel ou como parâmetro; a ordenação é traduzida para um
    # nome interno; e o nome da métrica fica em Ruby. Na origem ele virava `AS <nome>`, e `sort.field` ia
    # cru para o `ORDER BY`.
    #
    # Campo com `jsonb:` mora dentro daquela coluna, como número. Campo com `sql:` é uma expressão fixa, escrita
    # na definição da fonte, e nunca algo que veio do cliente. Os outros são colunas de verdade, então uma fonte
    # nova em Postgres entra sem mexer aqui.
    class ActiveRecordBuilder
      def initialize(source, account, query, time_range:, zone:, max_time_ms:)
        @source = source
        @account = account
        @query = query
        @time_range = time_range
        @zone = zone
        @max_time_ms = max_time_ms
        @dimensions = Array(query["dimensions"])
        @metrics = Array(query["metrics"])
      end

      def execute
        within_deadline { dimensions.empty? && metrics.empty? ? build_raw_result : build_aggregated_result }
      rescue ActiveRecord::QueryCanceled
        raise QueryEngine::DeadlineExceeded
      rescue ActiveRecord::StatementInvalid => error
        Rails.logger.error("[CustomDashboards] #{source.key}: #{error.class}: #{error.message}")
        raise QueryEngine::QueryError.new("queryFailed")
      end

      private

      attr_reader :source, :account, :query, :time_range, :zone, :max_time_ms, :dimensions, :metrics

      # O mesmo prazo do `max_time_ms` no Mongo. `SET LOCAL` vale só nesta transação: a conexão volta para o
      # pool como estava.
      def within_deadline
        model.transaction do
          connection.execute("SET LOCAL statement_timeout = #{max_time_ms.to_i}")

          yield
        end
      end

      def model
        source.model
      end

      def connection
        model.connection
      end

      def arel(field)
        return Arel.sql(field.sql) if field.sql

        model.arel_table[field.db_column]
      end

      def limit
        (query["limit"] || QueryEngine::MAX_ROWS).to_i
      end

      def raw_limit
        (query["limit"] || QueryEngine::DEFAULT_RAW_ROWS).to_i
      end

      # O campo como expressão de SQL.
      def expression(field)
        return field.sql if field.sql
        return "(#{quoted_column(field.jsonb)}->>#{connection.quote(field.key)})::float" if field.jsonb

        quoted_column(field.db_column)
      end

      def quoted_column(column)
        "#{connection.quote_table_name(model.table_name)}.#{connection.quote_column_name(column)}"
      end

      def base_scope
        time_field = source.field(time_range.field)
        scope = source.scope.call(account).where(arel(time_field).between(time_range.from..time_range.to))

        Array(query["filters"]).reduce(scope) { |current, filter| apply_filter(current, filter) }
      end

      def apply_filter(scope, filter)
        field = source.field(filter["field"])

        field.jsonb ? apply_jsonb_filter(scope, field, filter) : apply_column_filter(scope, field, filter)
      end

      def apply_jsonb_filter(scope, field, filter)
        sql = expression(field)
        value = filter["value"]

        case filter["operator"]
        when "eq" then scope.where("#{sql} = ?", value.to_f)
        when "ne" then scope.where("#{sql} != ?", value.to_f)
        when "gt" then scope.where("#{sql} > ?", value.to_f)
        when "gte" then scope.where("#{sql} >= ?", value.to_f)
        when "lt" then scope.where("#{sql} < ?", value.to_f)
        when "lte" then scope.where("#{sql} <= ?", value.to_f)
        when "in" then scope.where("#{sql} IN (?)", Array(value).map(&:to_f))
        when "nin" then scope.where("#{sql} NOT IN (?)", Array(value).map(&:to_f))
        when "exists" then scope.where("#{sql} IS NOT NULL")
        when "not_exists" then scope.where("#{sql} IS NULL")
        else scope
        end
      end

      # Por Arel: o valor passa pelo tipo da coluna, e o fuso da hora de parede não se perde numa coluna
      # de data.
      def apply_column_filter(scope, field, filter)
        column = arel(field)
        value = cast(field, filter["value"])

        case filter["operator"]
        when "eq" then scope.where(column.eq(value))
        when "ne" then scope.where(column.not_eq(value))
        when "gt" then scope.where(column.gt(value))
        when "gte" then scope.where(column.gteq(value))
        when "lt" then scope.where(column.lt(value))
        when "lte" then scope.where(column.lteq(value))
        when "in" then scope.where(column.in(Array(value)))
        when "nin" then scope.where(column.not_in(Array(value)))
        when "contains" then scope.where(column.matches("%#{ActiveRecord::Base.sanitize_sql_like(value.to_s)}%"))
        when "exists" then scope.where(column.not_eq(nil))
        when "not_exists" then scope.where(column.eq(nil))
        else scope
        end
      end

      def cast(field, value)
        return value.map { |item| cast(field, item) } if value.is_a?(Array)

        case field.type
        when "date" then Agenda::TimeInput.parse(value, zone)
        when "number" then value.to_f
        when "boolean" then ActiveModel::Type::Boolean.new.cast(value)
        else value
        end
      end

      def build_raw_result
        records = raw_scope.order(raw_order).limit(raw_limit + 1).to_a

        rows = records.first(raw_limit).map do |record|
          values = record.attributes
          source.fields.to_h { |field| [ field.key, field.jsonb ? values[field.jsonb]&.dig(field.key) : values[field.db_column] ] }
        end

        { rows: rows, columns: source.allowed_fields, truncated: records.size > raw_limit }
      end

      # Campo com `sql:` não é coluna da tabela: precisa vir no `SELECT`, com o nome dele.
      def raw_scope
        computed = source.fields.select(&:sql)
        return base_scope if computed.empty?

        base_scope.select(model.arel_table[Arel.star], *computed.map { |field| Arel.sql("#{field.sql} AS #{connection.quote_column_name(field.db_column)}") })
      end

      def raw_order
        sort = query["sort"].to_h
        return Arel.sql("#{expression(source.field(time_range.field))} DESC") if sort["field"].blank?

        field = source.field(sort["field"])
        raise QueryEngine::QueryError.new("invalidSort", field: "sort", name: sort["field"].to_s) unless field

        Arel.sql("#{expression(field)} #{direction(sort)}")
      end

      def direction(sort)
        sort["direction"] == "desc" ? "DESC" : "ASC"
      end

      def build_aggregated_result
        renames = compute_column_renames

        scope = base_scope.select(*select_list)
        scope = scope.group(*dimensions.each_index.map { |index| Arel.sql(dimension_alias(index)) }) if dimensions.any?
        scope = apply_order(scope, renames)

        records = scope.limit(limit + 1).to_a
        rows = records.first(limit).map do |record|
          values = record.attributes
          renames.to_h { |internal, output| [ output, aggregated_value(internal, values[internal]) ] }
        end

        { rows: rows, columns: rows.empty? ? [] : renames.values, truncated: records.size > limit }
      end

      # `attributes`, e não `record[...]`: o modelo pode redefinir o `[]`, e estes nomes só existem nesta
      # consulta. Dimensão de data volta como hora de parede: vira o começo do dia no fuso da organização.
      def aggregated_value(internal, value)
        return value unless value.respond_to?(:year) && dimension_date?(internal)

        zone.local(value.year, value.month, value.day)
      end

      def dimension_date?(internal)
        index = internal.delete_prefix("dimension_")
        return false if index == internal

        source.field(dimensions[index.to_i]["field"]).date?
      end

      def dimension_alias(index)
        "dimension_#{index}"
      end

      def select_list
        selects = dimensions.each_with_index.map { |dimension, index| Arel.sql("#{dimension_expression(dimension)} AS #{dimension_alias(index)}") }

        metrics.each_with_index { |metric, index| selects << Arel.sql("#{metric_expression(metric)} AS metric_#{index}") }

        selects
      end

      # A granularidade já passou pela lista, e o mapa garante que só estes textos entram no SQL.
      def dimension_expression(dimension)
        field = source.field(dimension["field"])
        return expression(field) unless field.date?

        local = local_time_expression(field)

        case dimension["granularity"]
        when "week" then "date_trunc('week', #{local})"
        when "month" then "date_trunc('month', #{local})"
        when "year" then "date_trunc('year', #{local})"
        else "date_trunc('day', #{local})"
        end
      end

      # Coluna de data já é o dia certo. Coluna de hora está em UTC: em UTC, o movimento das 21h cairia no
      # dia seguinte.
      def local_time_expression(field)
        return expression(field) if model.columns_hash[field.db_column]&.type == :date

        "(#{expression(field)} AT TIME ZONE 'UTC' AT TIME ZONE #{connection.quote(zone.tzinfo.name)})"
      end

      def metric_expression(metric)
        return "COUNT(*)" if metric["aggregation"] == "count" || metric["field"].blank?

        operand = expression(source.field(metric["field"]))

        case metric["aggregation"]
        when "sum" then "SUM(#{operand})"
        when "avg" then "AVG(#{operand})"
        when "min" then "MIN(#{operand})"
        when "max" then "MAX(#{operand})"
        else "COUNT(*)"
        end
      end

      def apply_order(scope, renames)
        sort = query["sort"].to_h
        return scope.order(Arel.sql("#{sort_alias(sort['field'], renames)} #{direction(sort)}")) if sort["field"].present?

        dimensions.any? ? scope.order(Arel.sql("#{dimension_alias(0)} ASC")) : scope
      end

      def sort_alias(sort_field, renames)
        metrics.each_index do |index|
          internal = "metric_#{index}"
          return internal if sort_field == internal || sort_field == renames[internal]
        end

        dimensions.each_with_index do |dimension, index|
          internal = dimension_alias(index)
          return internal if sort_field == dimension["field"] || sort_field == renames[internal]
        end

        raise QueryEngine::QueryError.new("invalidSort", field: "sort", name: sort_field.to_s)
      end

      def compute_column_renames
        used = {}
        renames = {}

        dimensions.each_with_index { |dimension, index| renames[dimension_alias(index)] = claim_column_name(used, dimension["field"]) }

        metrics.each_with_index do |metric, index|
          label = metric["label"].presence || "#{metric['aggregation']}_#{metric['field'].presence || 'count'}"
          renames["metric_#{index}"] = claim_column_name(used, label)
        end

        renames
      end

      def claim_column_name(used, name)
        count = used[name] = used.fetch(name, 0) + 1
        count == 1 ? name : "#{name} (#{count})"
      end
    end
  end
end
