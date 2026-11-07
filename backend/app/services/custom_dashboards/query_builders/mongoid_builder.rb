# frozen_string_literal: true

module CustomDashboards
  module QueryBuilders
    # Gera a pipeline de agregação a partir da consulta já conferida por `QueryEngine`.
    #
    # Três cuidados que são a razão de ser desta classe:
    #
    # 1. **O escopo vem por último, numa condição própria.** O `$match` é um `$and` de uma condição por
    #    filtro mais o escopo da fonte. Com um mapa só, como na origem, um filtro sobre o mesmo campo
    #    sobrescreveria a condição anterior.
    # 2. **Valor do cliente é sempre valor.** Em expressão de agregação, texto começando com `$` é caminho
    #    de campo: `{ $eq: ['$status', '$notes'] }` compararia dois campos. Tudo passa por `$literal`.
    # 3. **O `$match` usa índice.** A organização é o prefixo de todos os índices das coleções grandes, e
    #    mensagem é alcançada pelas conversas (ver `Sources::Messages`).
    class MongoidBuilder
      CUSTOM_ATTR_PREFIX = "custom_attributes."
      # Comparações numéricas sobre custom attributes (strings livres) usam $convert → double; os demais
      # operadores comparam o valor cru.
      NUMERIC_OPERATORS = %w[gt gte lt lte].freeze

      def initialize(source, account, query, time_range:, zone:, max_time_ms:)
        @source = source
        @account = account
        @organization_id = account.organization_id.to_s
        @query = query
        @time_range = time_range
        @zone = zone
        @max_time_ms = max_time_ms
        @dimensions = Array(query["dimensions"])
        @metrics = Array(query["metrics"])
        @column_renames = {}
      end

      def execute
        return build_raw_result if dimensions.empty? && metrics.empty?

        @column_renames = compute_column_renames
        raw_results = run(aggregated_stages)

        build_aggregated_result(raw_results)
      end

      private

      attr_reader :source, :account, :organization_id, :query, :time_range, :zone, :max_time_ms, :dimensions, :metrics

      def limit
        (query["limit"] || QueryEngine::MAX_ROWS).to_i
      end

      def raw_limit
        (query["limit"] || QueryEngine::DEFAULT_RAW_ROWS).to_i
      end

      # Mensagem parte das conversas: é a coleção delas que recebe a agregação.
      def collection
        (source.via_chats ? Chat : source.model).collection
      end

      def run(stages)
        options = { allow_disk_use: true, max_time_ms: max_time_ms }
        hint = source.via_chats ? Insights::ChatIndexes::BY_ACTIVITY : source.field(time_range.field).index
        options[:hint] = hint if hint

        collection.aggregate(source_stages + stages, **options).to_a
      end

      def source_stages
        return [ { "$match" => document_match } ] unless source.via_chats

        [
          { "$match" => chats_match },
          { "$project" => { "_id" => 1 } },
          {
            "$lookup" => {
              "from" => source.model.collection.name,
              "localField" => "_id",
              "foreignField" => "chat_id",
              "as" => "m",
              "pipeline" => [ { "$match" => document_match } ]
            }
          },
          { "$unwind" => "$m" },
          { "$replaceRoot" => { "newRoot" => "$m" } }
        ]
      end

      # As conversas de onde saem as mensagens do período: pelo índice { organization_id, last_message_at }.
      def chats_match
        source.scope.call(account)
              .where(:last_message_at.gte => time_range.from, :created_at.lte => time_range.to)
              .selector
      end

      def aggregated_stages
        stages = lookup_stages
        stages << { "$group" => group_stage }

        sort = sort_stage
        stages << { "$sort" => sort } if sort

        # Um documento a mais, para detectar truncamento sem falso positivo.
        stages << { "$limit" => limit + 1 }
        stages << { "$project" => project_stage }
        stages
      end

      # ── $match ──────────────────────────────────────────────────────────────

      def document_match
        conditions = [ time_condition, *Array(query["filters"]).filter_map { |filter| filter_condition(filter) } ]
        scope = source.via_chats ? MessageGuards.match : source.scope.call(account).selector

        { "$and" => [ *conditions, scope ] }
      end

      def time_condition
        { source.field(time_range.field).db_column => { "$gte" => time_range.from, "$lte" => time_range.to } }
      end

      def filter_condition(filter)
        name = filter["field"].to_s
        operator = filter["operator"]

        return document_id_condition(name, operator, filter["value"]) if DataSourceRegistry.document_id_filter(source, name)

        if custom_attribute_filter?(name)
          key, value = custom_attribute_parts(name, filter["value"])
          return custom_attribute_condition(key, operator, value)
        end

        field = source.field(name)
        return tags_condition(field, operator, filter["value"]) if field.relationship

        { field.db_column => query_condition(operator, cast(field, filter["value"])) }
      end

      def document_id_condition(name, operator, value)
        ids = document_filter_ids(name, value)

        { "_id" => { (%w[ne nin].include?(operator) ? "$nin" : "$in") => ids } }
      end

      def tags_condition(field, operator, value)
        { field.db_column => { (%w[ne nin].include?(operator) ? "$nin" : "$in") => chat_tag_ids(value) } }
      end

      def custom_attribute_filter?(name)
        name == "custom_attributes" || name.start_with?(CUSTOM_ATTR_PREFIX)
      end

      # Duas formas: `{ field: 'custom_attributes', value: { key:, value: } }` e
      # `{ field: 'custom_attributes.<chave>', value: }`. As duas já passaram pela lista de chaves.
      def custom_attribute_parts(name, value)
        return [ value["key"].to_s, value["value"] ] if name == "custom_attributes"

        [ name.delete_prefix(CUSTOM_ATTR_PREFIX), value ]
      end

      def custom_attribute_condition(key, operator, value)
        column = "#{CUSTOM_ATTR_PREFIX}#{key}"
        return { "$expr" => numeric_comparison_expr("$#{column}", operator, value) } if NUMERIC_OPERATORS.include?(operator)

        { column => query_condition(operator, value) }
      end

      # A forma de `$match`. Em `eq`, `$eq` explícito: com o valor solto, um mapa viraria operador.
      def query_condition(operator, value)
        case operator
        when "eq" then { "$eq" => value }
        when "ne" then { "$ne" => value }
        when "gt" then { "$gt" => value }
        when "gte" then { "$gte" => value }
        when "lt" then { "$lt" => value }
        when "lte" then { "$lte" => value }
        when "in" then { "$in" => Array(value) }
        when "nin" then { "$nin" => Array(value) }
        when "contains" then { "$regex" => Regexp.escape(value.to_s), "$options" => "i" }
        when "exists" then { "$ne" => nil }
        when "not_exists" then { "$eq" => nil }
        end
      end

      # ── $group ──────────────────────────────────────────────────────────────

      def group_stage
        group_id = dimensions.to_h { |dimension| [ group_alias(dimension["field"]), group_expression(dimension) ] }
        # Sem dimensões, agrupa tudo.
        group = { "_id" => group_id.empty? ? nil : group_id }

        metrics.each_with_index { |metric, index| group["metric_#{index}"] = metric_accumulator(metric) }

        group
      end

      def group_expression(dimension)
        name = dimension["field"]
        return custom_attribute_group_expression(name) if custom_attribute_dimension?(name)

        related = DataSourceRegistry.related_dimension(source, name)
        return "$_rel_#{name}.#{related[:display_field]}" if related

        field = source.field(name)
        return "$#{field.db_column}" unless field.date?

        date_trunc("$#{field.db_column}", dimension["granularity"].presence || "day")
      end

      def date_trunc(path, unit)
        options = { "date" => path, "unit" => unit, "timezone" => zone.tzinfo.name }
        # Igual ao `date_trunc('week')` do Postgres: uma série do rollup alinha com a das outras fontes.
        options["startOfWeek"] = "monday" if unit == "week"

        { "$dateTrunc" => options }
      end

      def metric_accumulator(metric)
        aggregation = metric["aggregation"]
        path = metric["field"].present? ? "$#{source.field(metric['field']).db_column}" : nil
        condition = Array(metric["filters"]).any? ? metric_condition(metric["filters"], metric["filters_operator"]) : nil

        if condition
          return { "$sum" => { "$cond" => [ condition, 1, 0 ] } } unless %w[sum avg min max].include?(aggregation)

          { "$#{aggregation}" => { "$cond" => [ condition, path, nil ] } }
        else
          return { "$sum" => 1 } unless %w[sum avg min max].include?(aggregation)

          { "$#{aggregation}" => path }
        end
      end

      # A expressão booleana dos filtros de uma métrica condicional. Diferente do `$match`, aqui os
      # operadores usam a forma binária de expressão. `or` combina com $or (padrão: $and).
      def metric_condition(filters, filters_operator)
        expressions = filters.filter_map { |filter| metric_filter_expression(filter) }
        return { "$literal" => true } if expressions.empty?
        return expressions.first if expressions.size == 1

        filters_operator == "or" ? { "$or" => expressions } : { "$and" => expressions }
      end

      def metric_filter_expression(filter)
        name = filter["field"].to_s
        operator = filter["operator"]

        if custom_attribute_filter?(name)
          key, value = custom_attribute_parts(name, filter["value"])
          path = "$#{CUSTOM_ATTR_PREFIX}#{key}"
          return numeric_comparison_expr(path, operator, value) if NUMERIC_OPERATORS.include?(operator)

          return comparison_expression(path, operator, value)
        end

        if DataSourceRegistry.document_id_filter(source, name)
          expression = { "$in" => [ "$_id", { "$literal" => document_filter_ids(name, filter["value"]) } ] }
          return %w[ne nin].include?(operator) ? { "$not" => [ expression ] } : expression
        end

        field = source.field(name)
        if field.relationship
          expression = array_membership_expression("$#{field.db_column}", chat_tag_ids(filter["value"]))
          return %w[ne nin].include?(operator) ? { "$not" => [ expression ] } : expression
        end

        comparison_expression("$#{field.db_column}", operator, cast(field, filter["value"]))
      end

      def comparison_expression(path, operator, value)
        literal = { "$literal" => value }

        case operator
        when "ne" then { "$ne" => [ path, literal ] }
        when "gt" then { "$gt" => [ path, literal ] }
        when "gte" then { "$gte" => [ path, literal ] }
        when "lt" then { "$lt" => [ path, literal ] }
        when "lte" then { "$lte" => [ path, literal ] }
        when "in" then { "$in" => [ path, { "$literal" => Array(value) } ] }
        when "nin" then { "$not" => [ { "$in" => [ path, { "$literal" => Array(value) } ] } ] }
        when "contains"
          # $regexMatch erra com entrada que não é texto; a guarda devolve false nesses casos.
          {
            "$cond" => [
              { "$eq" => [ { "$type" => path }, "string" ] },
              { "$regexMatch" => { "input" => path, "regex" => Regexp.escape(value.to_s), "options" => "i" } },
              false
            ]
          }
        # $ifNull coage campo AUSENTE para null (o $eq de agregação não os iguala).
        when "exists" then { "$ne" => [ { "$ifNull" => [ path, nil ] }, nil ] }
        when "not_exists" then { "$eq" => [ { "$ifNull" => [ path, nil ] }, nil ] }
        else { "$eq" => [ path, literal ] }
        end
      end

      def numeric_convert_expr(path)
        { "$convert" => { "input" => path, "to" => "double", "onError" => nil, "onNull" => nil } }
      end

      # Valor numérico do campo em tempo de consulta: conversão direta ("30") ou, em fallback, o MENOR
      # número extraído do texto ("20 a 40/dia" → 20.0), consistente com a estratégia padrão da
      # normalização na escrita. Sem número extraível → null (excluído pela guarda da comparação).
      def numeric_value_expr(path)
        { "$ifNull" => [ numeric_convert_expr(path), extracted_min_number_expr(path) ] }
      end

      # $regexFindAll só aceita texto: a guarda de $type evita erro em hashes e arrays. Vírgula decimal
      # vira ponto; milhar pt-BR ("50.000,00") fica melhor servido pela normalização materializada.
      def extracted_min_number_expr(path)
        {
          "$cond" => [
            { "$eq" => [ { "$type" => path }, "string" ] },
            {
              "$min" => {
                "$map" => {
                  "input" => { "$regexFindAll" => { "input" => path, "regex" => '\d+(?:[.,]\d+)?' } },
                  "as" => "m",
                  "in" => {
                    "$convert" => {
                      "input" => { "$replaceAll" => { "input" => "$$m.match", "find" => ",", "replacement" => "." } },
                      "to" => "double", "onError" => nil, "onNull" => nil
                    }
                  }
                }
              }
            },
            nil
          ]
        }
      end

      # Comparação numérica sobre valor guardado como texto livre. A guarda de null é OBRIGATÓRIA: na
      # ordem BSON, null < N é verdadeiro, e sem ela lt/lte contariam documentos sem valor.
      def numeric_comparison_expr(path, operator, value)
        {
          "$let" => {
            "vars" => { "num" => numeric_value_expr(path) },
            "in" => {
              "$and" => [
                { "$ne" => [ "$$num", nil ] },
                { "$#{operator}" => [ "$$num", value.to_s.to_f ] }
              ]
            }
          }
        }
      end

      # Verdadeiro quando o campo intersecta os ids. O campo pode ser array (chat_tag_ids) ou escalar,
      # quando um $unwind de dimensão relacionada já achatou o array antes do $group.
      def array_membership_expression(path, ids)
        literal = { "$literal" => ids }

        {
          "$cond" => [
            { "$isArray" => path },
            { "$gt" => [ { "$size" => { "$setIntersection" => [ path, literal ] } }, 0 ] },
            { "$in" => [ { "$ifNull" => [ path, nil ] }, literal ] }
          ]
        }
      end

      # Agrupa pelo valor cru do atributo; ausente/null vira o bucket "(vazio)" e valores não escalares
      # viram "(inválido)".
      def custom_attribute_group_expression(name)
        path = "$#{name}"

        {
          "$cond" => [
            { "$in" => [ { "$type" => path }, %w[object array] ] },
            DataSourceRegistry::INVALID_BUCKET,
            { "$ifNull" => [ path, DataSourceRegistry::EMPTY_BUCKET ] }
          ]
        }
      end

      # ── $sort, $project ─────────────────────────────────────────────────────

      def sort_stage
        sort = query["sort"].to_h

        if sort["field"].present?
          field = resolve_sort_field(sort["field"])
          stage = { field => (sort["direction"] == "desc" ? -1 : 1) }
          # Empate: sem o desempate, o limite corta um valor diferente a cada consulta, e as barras trocam de lugar.
          field.start_with?("_id") ? stage : stage.merge("_id" => 1)
        elsif dimensions.first
          # Pela primeira dimensão, ascendente, por padrão.
          { "_id.#{group_alias(dimensions.first['field'])}" => 1 }
        end
      end

      # Traduz o campo de ordenação (nome de métrica ou de dimensão) para o nome interno disponível depois
      # do $group. O que não for nenhum dos dois é recusado: na origem ia cru para o `$sort`.
      def resolve_sort_field(sort_field)
        metrics.each_index do |index|
          internal = "metric_#{index}"
          return internal if sort_field == internal || sort_field == @column_renames[internal]
        end

        dimensions.each do |dimension|
          name = dimension["field"]
          alias_name = group_alias(name)
          return "_id.#{alias_name}" if sort_field == name || sort_field == @column_renames[alias_name]
        end

        raise QueryEngine::QueryError.new("invalidSort", field: "sort", name: sort_field.to_s)
      end

      def project_stage
        project = { "_id" => 0 }

        dimensions.each do |dimension|
          alias_name = group_alias(dimension["field"])
          project[alias_name] = "$_id.#{alias_name}"
        end

        metrics.each_index { |index| project["metric_#{index}"] = 1 }

        project
      end

      # Mapa ordenado alias interno => nome de coluna exibido (dimensões, depois métricas). Nomes
      # duplicados ganham sufixo numérico para não colidirem na linha.
      def compute_column_renames
        renames = {}
        used = {}

        dimensions.each do |dimension|
          name = dimension["field"]
          renames[group_alias(name)] = claim_column_name(used, name)
        end

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

      def custom_attribute_dimension?(name)
        name.to_s.start_with?(CUSTOM_ATTR_PREFIX)
      end

      # Alias interno seguro para o $group e o $project: caminho com ponto criaria documento aninhado.
      def group_alias(name)
        return name unless custom_attribute_dimension?(name)

        "_ca__#{name.delete_prefix(CUSTOM_ATTR_PREFIX)}"
      end

      # ── resultado ───────────────────────────────────────────────────────────

      # Sem dimensões nem métricas, cada linha é um documento: só os campos da lista, nunca o documento
      # inteiro. Passa pela mesma pipeline, com o mesmo `$match`.
      def build_raw_result
        fields = source.fields
        documents = run(
          [
            { "$sort" => raw_sort },
            { "$limit" => raw_limit + 1 },
            { "$project" => fields.to_h { |field| [ field.db_column, 1 ] } }
          ]
        )

        rows = documents.first(raw_limit)
        tags = chat_tag_names(rows, fields)

        {
          rows: rows.map do |document|
            fields.to_h { |field| [ field.key, raw_value(field, document, tags) ] }
          end,
          columns: fields.map(&:key),
          truncated: documents.size > raw_limit
        }
      end

      def raw_sort
        sort = query["sort"].to_h
        return { source.field(time_range.field).db_column => -1 } if sort["field"].blank?

        field = source.field(sort["field"])
        raise QueryEngine::QueryError.new("invalidSort", field: "sort", name: sort["field"].to_s) if field.nil? || field.custom_attribute?

        { field.db_column => (sort["direction"] == "desc" ? -1 : 1) }
      end

      def raw_value(field, document, tags)
        value = document[field.db_column]

        field.relationship ? Array(value).filter_map { |id| tags[id] } : value
      end

      def chat_tag_names(rows, fields)
        relationship = fields.find(&:relationship)
        return {} unless relationship

        ids = rows.flat_map { |row| Array(row[relationship.db_column]) }.uniq
        ChatTag.where(organization_id: organization_id, :_id.in => ids).pluck(:id, :name).to_h
      end

      def build_aggregated_result(raw_results)
        truncated = raw_results.size > limit
        return { rows: [], columns: [], truncated: truncated } if raw_results.empty?

        rows = raw_results.first(limit).map do |document|
          @column_renames.to_h { |internal, output| [ output, document[internal] ] }
        end

        { rows: rows, columns: @column_renames.values, truncated: truncated }
      end

      # Dimensão de relacionamento: junta a coleção relacionada. A organização já veio do `$match`, e o
      # id da etiqueta ou do profissional está no próprio documento.
      def lookup_stages
        dimensions.flat_map do |dimension|
          name = dimension["field"]
          related = DataSourceRegistry.related_dimension(source, name)
          next [] unless related

          stages = []
          stages << { "$unwind" => "$#{related[:local_field]}" } if related[:is_array]
          stages << {
            "$lookup" => {
              "from" => related[:model].constantize.collection.name,
              "localField" => related[:local_field],
              "foreignField" => "_id",
              "as" => "_rel_#{name}"
            }
          }
          stages << { "$unwind" => "$_rel_#{name}" }
          stages
        end
      end

      # ── valores ─────────────────────────────────────────────────────────────

      def cast(field, value)
        return value.map { |item| cast_single(field, item) } if value.is_a?(Array)

        cast_single(field, value)
      end

      def cast_single(field, value)
        return cast_object_id(value) if field.cast == :object_id
        # "Pendente" no comparecimento é ausência de valor, e a tela manda texto vazio.
        return nil if value.blank? && field.enum_values&.include?(nil)

        case field.type
        when "number"
          number = value.to_f
          number == number.to_i ? number.to_i : number
        when "date" then Agenda::TimeInput.parse(value, zone)
        when "boolean" then ActiveModel::Type::Boolean.new.cast(value)
        else value
        end
      end

      # Id inválido não casa com nada, em vez de virar erro: pode ser um valor antigo guardado no widget.
      def cast_object_id(value)
        BSON::ObjectId.legal?(value.to_s) ? BSON::ObjectId.from_string(value.to_s) : value.to_s
      end

      # Nome de etiqueta para os ids dela, na organização. Memoizado: várias colunas com o mesmo filtro
      # fazem uma consulta só.
      def chat_tag_ids(values)
        @chat_tag_ids ||= {}
        names = Array(values).map(&:to_s).sort
        @chat_tag_ids[names] ||= ChatTag.where(organization_id: organization_id, :name.in => names).pluck(:_id)
      end

      def document_filter_ids(name, values)
        @document_filter_ids ||= {}
        cache_key = [ name, Array(values).map(&:to_s).sort ]
        @document_filter_ids[cache_key] ||= DocumentIdResolvers.resolve(source, name, account, values)
      end

      module MessageGuards
        module_function

        # As mesmas guardas do dashboard: `.collection.aggregate` ignora o default_scope do modelo.
        def match
          Insights::MessageAuthorship.match_guards
        end
      end
    end
  end
end
