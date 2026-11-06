# frozen_string_literal: true

module CustomDashboards
  # Executa a consulta de um widget, sem importar se a fonte mora no Mongo ou no Postgres.
  #
  # **A consulta vem do cliente.** Tudo passa por lista permitida antes de virar pipeline ou SQL: fonte,
  # campo, operador, agregação, granularidade, ordenação e limite. Na origem a validação não olhava a
  # ordenação, o nome da métrica virava alias de SQL, e a chave de campo personalizado ia crua para o
  # caminho do Mongo.
  #
  # O escopo da fonte (organização e `Chat.visible_to`) é aplicado por último pelos construtores, numa
  # condição própria: nada do que o cliente manda alcança ou substitui essa chave.
  #
  # O prazo é de verdade: `max_time_ms` no Mongo e `statement_timeout` no Postgres, o que a origem declarava
  # em `QUERY_TIMEOUT` e nunca usava.
  class QueryEngine
    MAX_ROWS = 10_000
    # Sem agrupar, cada linha é um documento: o teto padrão é menor, e quem precisa pede até `MAX_ROWS`.
    DEFAULT_RAW_ROWS = 1_000
    MAX_METRICS = 12
    MAX_METRIC_FILTERS = 5
    MAX_DIMENSIONS = 5
    MAX_FILTERS = 30
    MAX_FILTER_VALUES = 1_000
    MAX_FILTER_VALUE_LENGTH = 500
    # Em segundos, para a requisição inteira: na consulta composta, os passos dividem o mesmo prazo.
    QUERY_TIMEOUT = 30
    DEFAULT_RANGE_DAYS = 90
    MAX_RANGE_DAYS = 731
    # Mensagem não tem índice por organização: o período é o que limita a varredura.
    MAX_MESSAGES_RANGE_DAYS = 366
    ALLOWED_OPERATORS = %w[eq ne gt gte lt lte in nin contains exists not_exists].freeze
    # Etiqueta e presença em agendamento são pertença a um conjunto: "maior que" não quer dizer nada, e a
    # origem simplesmente ignorava o filtro, devolvendo tudo.
    SET_OPERATORS = %w[eq ne in nin].freeze
    # Os únicos que recebem lista. Nos outros ela não quer dizer nada, e no Postgres seria erro de servidor.
    LIST_OPERATORS = %w[in nin].freeze
    COMPARISON_OPERATORS = %w[gt gte lt lte].freeze
    PRESENCE_OPERATORS = %w[exists not_exists].freeze
    # Procurar um trecho num número ou numa data: no Mongo não casa com nada, e no Postgres é erro de SQL.
    NON_TEXT_TYPES = %w[number date boolean].freeze
    # Além destes o BSON nem grava: inteiro acima de 64 bits, e milissegundos de um ano que não existe.
    MAX_FILTER_NUMBER = 1e15
    PLAUSIBLE_YEARS = (1900..2200)
    ALLOWED_GRANULARITIES = %w[day week month year].freeze
    ALLOWED_AGGREGATIONS = %w[count sum avg min max].freeze
    # `min` e `max` servem para data também; somar data não existe.
    NUMBER_ONLY_AGGREGATIONS = %w[sum avg].freeze
    DATE_ONLY = /\A\d{4}-\d{2}-\d{2}\z/

    class Forbidden < StandardError; end

    # O Postgres cortou pelo prazo. O corte do Mongo chega ao controller como `OperationFailure`.
    class DeadlineExceeded < StandardError; end

    # Recusa com código de máquina: é o contrato, e a mensagem sai no idioma da requisição.
    class QueryError < StandardError
      attr_reader :code, :field

      def initialize(code, field: nil, **interpolation)
        @code = code
        @field = field
        super(I18n.t("insights.custom_dashboards.errors.#{code.underscore}", **interpolation))
      end
    end

    # O período já conferido: `field` é sempre um campo de data da fonte.
    TimeRange = Struct.new(:field, :from, :to, keyword_init: true)

    class << self
      # @param account [Account] quem consulta: é daqui que saem a organização e a visibilidade
      # @param data_source [String] chave da fonte
      # @param query [Hash] { metrics, dimensions, filters, time_range, sort, limit }. Cada métrica aceita
      #   filtros próprios (agregação condicional): { field, aggregation, label, filters: [...] }
      # @param deadline [Time] até quando esta consulta pode rodar
      # @return [Hash] { rows:, columns:, labels:, field_labels:, meta: } com os valores ainda em Ruby
      def execute(account:, data_source:, query:, deadline: QUERY_TIMEOUT.seconds.from_now)
        source = DataSourceRegistry.find_source(data_source)
        raise QueryError.new("unknownDataSource", field: "dataSource") unless source
        raise Forbidden unless source.available_to?(account)

        validate_query!(source, query, account)
        zone = account.organization.reporting_zone
        time_range = resolve_time_range(source, query["time_range"], zone)
        result = builder_for(source).new(source, account, query, time_range: time_range, zone: zone, max_time_ms: remaining_ms(deadline)).execute

        dimension_fields = Array(query["dimensions"]).map { |dimension| dimension["field"] }

        {
          rows: result[:rows],
          columns: result[:columns],
          labels: DataSourceRegistry.resolve_labels(source, result[:rows], dimension_fields, account.organization),
          field_labels: DataSourceRegistry.field_labels(source, dimension_fields, account.organization),
          meta: {
            total: result[:rows].size,
            truncated: result[:truncated] || false,
            # `floor`: `end_of_day` tem nanossegundos, e arredondar diria que o período vai até o dia seguinte.
            timeRange: { field: time_range.field, from: ApplicationSerializer.epoch_ms(time_range.from), to: ApplicationSerializer.epoch_ms(time_range.to.floor(3)) }
          }
        }
      end

      private

      def builder_for(source)
        case source.orm
        when :mongoid then QueryBuilders::MongoidBuilder
        when :active_record then QueryBuilders::ActiveRecordBuilder
        else raise ArgumentError, "ORM não suportado: #{source.orm}"
        end
      end

      def remaining_ms(deadline)
        remaining = ((deadline - Time.current) * 1000).to_i
        raise QueryError.new("queryTimeout") unless remaining.positive?

        remaining
      end

      def validate_query!(source, query, account)
        validate_metrics!(source, Array(query["metrics"]), account)
        validate_dimensions!(source, Array(query["dimensions"]))
        validate_filters!(source, Array(query["filters"]), account)
        validate_limit!(query["limit"])
      end

      def validate_limit!(limit)
        return if limit.nil?

        value = Integer(limit.to_s, exception: false)
        raise QueryError.new("invalidLimit", field: "limit", max: MAX_ROWS) if value.nil? || !value.between?(1, MAX_ROWS)
      end

      def validate_metrics!(source, metrics, account)
        raise QueryError.new("tooManyMetrics", field: "metrics", max: MAX_METRICS) if metrics.size > MAX_METRICS

        metrics.each do |metric|
          validate_metric_aggregation!(source, metric)

          operator = metric["filters_operator"]
          raise QueryError.new("invalidFiltersOperator", field: "metrics") if operator.present? && !%w[and or].include?(operator)

          metric_filters = Array(metric["filters"])
          next if metric_filters.empty?

          raise QueryError.new("metricFiltersUnsupported", field: "metrics") if source.orm == :active_record
          raise QueryError.new("tooManyMetricFilters", field: "metrics", max: MAX_METRIC_FILTERS) if metric_filters.size > MAX_METRIC_FILTERS

          validate_filters!(source, metric_filters, account)
        end
      end

      def validate_metric_aggregation!(source, metric)
        field_name = metric["field"]
        aggregation = metric["aggregation"]

        # 'count' sem campo é permitido (COUNT(*)).
        return if aggregation == "count" && field_name.blank?

        field = source.field(field_name)
        raise QueryError.new("fieldNotAllowed", field: "metrics", name: field_name.to_s) if field.nil? || field.custom_attribute?
        raise QueryError.new("metricNotAllowed", field: "metrics", name: aggregation.to_s) unless ALLOWED_AGGREGATIONS.include?(aggregation) && source.allowed_metrics.include?(aggregation)
        return if aggregation == "count" || field.number? || (field.date? && NUMBER_ONLY_AGGREGATIONS.exclude?(aggregation))

        raise QueryError.new("metricNotAllowed", field: "metrics", name: aggregation.to_s)
      end

      def validate_dimensions!(source, dimensions)
        raise QueryError.new("tooManyDimensions", field: "dimensions", max: MAX_DIMENSIONS) if dimensions.size > MAX_DIMENSIONS

        dimensions.each do |dimension|
          name = dimension["field"].to_s
          granularity = dimension["granularity"]

          if custom_attribute_dimension?(source, name)
            raise QueryError.new("granularityUnsupported", field: "dimensions") if granularity.present?

            next
          end

          raise QueryError.new("dimensionNotAllowed", field: "dimensions", name: name) unless allowed_dimension?(source, name)
          raise QueryError.new("invalidGranularity", field: "dimensions", name: granularity.to_s) if granularity.present? && ALLOWED_GRANULARITIES.exclude?(granularity)
        end
      end

      def allowed_dimension?(source, name)
        source.allowed_dimensions.include?(name) ||
          source.field(name)&.groupable? ||
          DataSourceRegistry.related_dimension(source, name).present?
      end

      def custom_attribute_dimension?(source, name)
        source.custom_attributes? && name.match?(DataSourceRegistry::CUSTOM_ATTR_FIELD)
      end

      # Filtros de topo combinam sempre com AND; a lógica OU só existe nos filtros de métrica.
      def validate_filters!(source, filters, account)
        raise QueryError.new("tooManyFilters", field: "filters", max: MAX_FILTERS) if filters.size > MAX_FILTERS

        filters.each do |filter|
          name = filter["field"].to_s
          operator = filter["operator"]
          raise QueryError.new("fieldNotAllowed", field: "filters", name: name) unless DataSourceRegistry.valid_filter_field?(source, name)
          raise QueryError.new("operatorNotAllowed", field: "filters", name: operator.to_s) unless operator_allowed?(source, name, operator)

          document_filter = DataSourceRegistry.document_id_filter(source, name)
          raise Forbidden if document_filter && document_filter[:permission] && !account.can?(document_filter[:permission])

          validate_filter_value!(source, name, operator, filter["value"])
        end
      end

      def operator_allowed?(source, name, operator)
        return false unless ALLOWED_OPERATORS.include?(operator)
        return SET_OPERATORS.include?(operator) if set_filter?(source, name)

        operator != "contains" || NON_TEXT_TYPES.exclude?(source.field(name)&.type)
      end

      def set_filter?(source, name)
        DataSourceRegistry.document_id_filter(source, name).present? || source.field(name)&.relationship.present?
      end

      def validate_filter_value!(source, name, operator, value)
        if name == "custom_attributes"
          key = value.is_a?(Hash) ? value["key"].to_s : ""
          raise QueryError.new("fieldNotAllowed", field: "filters", name: "custom_attributes.#{key}") unless key.match?(DataSourceRegistry::CUSTOM_ATTR_KEY)

          value = value["value"]
        end

        raise QueryError.new("invalidFilterValue", field: "filters", name: name) unless acceptable_filter_value?(source, name, operator, value)

        Array(value).each { |item| parse_time(item, ActiveSupport::TimeZone["UTC"], name) } if source.field(name)&.date?
      end

      def acceptable_filter_value?(source, name, operator, value)
        return false if value.is_a?(Hash)

        values = Array(value)
        return false if values.size > MAX_FILTER_VALUES || values.any? { |item| item.to_s.length > MAX_FILTER_VALUE_LENGTH }
        return false if value.is_a?(Array) && !accepts_list?(source, name, operator)

        !numeric_filter?(source, name, operator) || values.all? { |item| acceptable_number?(item) }
      end

      # Etiqueta e presença são conjunto: "igual a" com vários valores quer dizer "um destes".
      def accepts_list?(source, name, operator)
        LIST_OPERATORS.include?(operator) || PRESENCE_OPERATORS.include?(operator) || set_filter?(source, name)
      end

      # Campo de número, e a comparação em campo personalizado, que compara como número. Em `exists` o valor
      # não conta, e a tela deixa lá o que estava antes de trocar o operador.
      def numeric_filter?(source, name, operator)
        return false if PRESENCE_OPERATORS.include?(operator)

        source.field(name)&.number? || (COMPARISON_OPERATORS.include?(operator) && custom_attribute_filter?(name))
      end

      def custom_attribute_filter?(name)
        name == "custom_attributes" || name.match?(DataSourceRegistry::CUSTOM_ATTR_FIELD)
      end

      # Vazio passa: é o filtro que a pessoa acabou de acrescentar na tela, e que ela ainda vai preencher.
      def acceptable_number?(item)
        return true if item.blank?

        number = Float(item.to_s, exception: false)
        !number.nil? && number.abs <= MAX_FILTER_NUMBER
      end

      def parse_time(value, zone, name)
        plausible_time(value, zone)
      rescue Agenda::TimeInput::Invalid
        raise QueryError.new("invalidFilterValue", field: "filters", name: name)
      end

      def plausible_time(value, zone)
        time = Agenda::TimeInput.parse(value, zone)
        raise Agenda::TimeInput::Invalid if time && !PLAUSIBLE_YEARS.cover?(time.year)

        time
      end

      # Sem período, valem os últimos 90 dias: a tela também manda isso, mas o limite é daqui. Campo que
      # não é data desta fonte vale o padrão dela (a consulta composta manda `created_at` para todas), e
      # nunca chega ao banco.
      def resolve_time_range(source, raw, zone)
        raw = raw.to_h
        field = source.field(raw["field"])
        field_name = field&.date? ? field.key : source.default_time_field

        to = parse_range_edge(raw["end"], zone) || zone.now
        # Só a data, como vem do filtro da tela: "até dia 6" inclui o dia 6.
        to = to.end_of_day if raw["end"].to_s.match?(DATE_ONLY)
        from = parse_range_edge(raw["start"], zone) || (to - DEFAULT_RANGE_DAYS.days)

        raise QueryError.new("invalidTimeRange", field: "timeRange") if to < from

        max_days = source.via_chats ? MAX_MESSAGES_RANGE_DAYS : MAX_RANGE_DAYS
        raise QueryError.new("rangeTooLong", field: "timeRange", days: max_days) if to - from > max_days.days

        TimeRange.new(field: field_name, from: from, to: to)
      end

      def parse_range_edge(value, zone)
        plausible_time(value, zone)
      rescue Agenda::TimeInput::Invalid
        raise QueryError.new("invalidTimeRange", field: "timeRange")
      end
    end
  end
end
