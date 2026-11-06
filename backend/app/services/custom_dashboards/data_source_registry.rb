# frozen_string_literal: true

module CustomDashboards
  # As fontes de dados dos dashboards personalizados: o que pode ser consultado, e a lista permitida de
  # campos, métricas e dimensões. É daqui que `QueryEngine` confere o que vem do cliente.
  #
  # **Registrar uma fonte nova** (a de pipelines, por exemplo): crie `sources/pipelines.rb` com um
  # `DEFINITION`, como os outros arquivos, acrescente o nome em `SOURCE_NAMES` e as traduções em
  # `insights.custom_dashboards.sources.<chave>` nos dois idiomas. Modelo Mongoid passa pelo
  # `MongoidBuilder` e ActiveRecord pelo `ActiveRecordBuilder`, sem mexer em mais nada.
  #
  # O escopo de cada fonte (`scope`) recebe a pessoa que consulta e é o que garante a organização.
  class DataSourceRegistry
    SOURCE_NAMES = %w[Conversations Contacts Messages AgendaBookings Campaigns DailyStats].freeze

    DataSource = Struct.new(
      :key, :model_class, :orm, :permission, :default_time_field, :scope, :fields, :allowed_metrics,
      :allowed_dimensions, :related_dimensions, :document_id_filters, :via_chats, keyword_init: true
    ) do
      def field(key)
        @fields_by_key ||= fields.index_by(&:key)
        @fields_by_key[key.to_s]
      end

      def model
        model_class.constantize
      end

      def allowed_fields
        fields.map(&:key)
      end

      def custom_attributes?
        fields.any?(&:custom_attribute?)
      end

      def available_to?(account)
        permission.nil? || account.can?(permission)
      end

      def label
        I18n.t("insights.custom_dashboards.sources.#{key}.label", default: key.humanize)
      end

      def field_label(field_key)
        I18n.t("insights.custom_dashboards.sources.#{key}.fields.#{field_key}", default: field_key.to_s.humanize)
      end
    end

    # `column`: onde o valor mora no banco, quando não é o nome da API. `jsonb`: a coluna jsonb que guarda
    # este campo, como número (só Postgres). `cast: :object_id`: o valor vem como texto e o banco guarda
    # ObjectId. `labels`: os valores que têm tradução. `label_from` e `options_from`: de onde vêm o nome do
    # id e as opções do filtro (`NAMED`). `relationship`: o campo é uma lista de ids filtrada pelo nome.
    Field = Struct.new(:key, :type, :enum_values, :column, :jsonb, :cast, :labels, :label_from, :options_from, :relationship, keyword_init: true) do
      def db_column
        column || key
      end

      def date?
        type == "date"
      end

      def number?
        type == "number"
      end

      def custom_attribute?
        type == "custom_attribute"
      end

      def groupable?
        !custom_attribute? && type != "array"
      end
    end

    # Buckets sentinela usados ao agrupar por custom attribute: documentos sem o atributo caem em
    # EMPTY_BUCKET; valores não escalares (hash/array) em INVALID_BUCKET.
    EMPTY_BUCKET = "__empty__"
    INVALID_BUCKET = "__invalid__"
    # Chaves de campo personalizado vêm de name.parameterize.underscore => [a-z0-9_].
    CUSTOM_ATTR_KEY = /\A[a-z0-9_]+\z/
    CUSTOM_ATTR_FIELD = /\Acustom_attributes\.([a-z0-9_]+)\z/

    # Os cadastros que dão nome a um id: { id: nome }, sempre dentro da organização.
    NAMED = {
      accounts: ->(organization) { organization.accounts.order(:name).pluck(:id, :name) },
      teams: ->(organization) { organization.teams.order(:name).pluck(:id, :name) },
      connectors: ->(organization) { named_documents(organization.connectors, :display_name) },
      agenda_professionals: ->(organization) { named_documents(organization.agenda_professionals, :name) },
      agenda_services: ->(organization) { named_documents(organization.agenda_services, :name) },
      agenda_calendars: ->(organization) { named_documents(organization.agenda_calendars, :name) },
      chat_tag_names: ->(organization) { organization.chat_tags.order_by(name: :asc).pluck(:name).map { |name| [ name, name ] } }
    }.freeze

    class << self
      def sources
        @sources ||= SOURCE_NAMES.to_h do |name|
          definition = "CustomDashboards::Sources::#{name}".constantize::DEFINITION
          key = name.underscore
          [
            key,
            DataSource.new(
              **definition.except(:fields),
              key: key,
              fields: definition[:fields].map { |field| Field.new(**field) },
              related_dimensions: definition.fetch(:related_dimensions, {}),
              document_id_filters: definition.fetch(:document_id_filters, {})
            )
          ]
        end.freeze
      end

      def find_source(key)
        sources[key.to_s]
      end

      # Os metadados para o construtor da tela, só das fontes que a pessoa pode consultar.
      def all_sources(account)
        sources.values.select { |source| source.available_to?(account) }.map { |source| source_meta(source, account) }
      end

      # As opções de filtro de uma fonte: { 'tags' => [{ value:, label: }], 'custom_attributes' => [...] }
      def filter_options(source, account)
        organization = account.organization

        result = source.fields.select(&:options_from).to_h do |field|
          [ field.key, named(field.options_from, organization).map { |value, label| { value: value, label: label } } ]
        end

        if source.custom_attributes?
          result["custom_attributes"] = organization.custom_fields.order_by(name: :asc).map do |definition|
            { value: definition.key, label: definition.name, valueType: definition.value_type, optionValues: definition.option_values }
          end
        end

        document_filters_for(source, account).each do |key, config|
          result[key] = config[:options].map { |value| { value: value, label: document_filter_value_label(source, key, value) } }
        end

        result
      end

      def valid_field?(source, name)
        return true if source.custom_attributes? && name.to_s.match?(CUSTOM_ATTR_FIELD)

        source.field(name).present?
      end

      # Campos aceitos em FILTROS: os da fonte + os virtuais. Não alargar `valid_field?`, que também
      # vale para período e dimensões, e campo virtual só faz sentido como filtro.
      def valid_filter_field?(source, name)
        valid_field?(source, name) || document_id_filter(source, name).present?
      end

      def document_id_filter(source, name)
        source.document_id_filters[name.to_s]
      end

      def related_dimension(source, name)
        source.related_dimensions[name.to_s]
      end

      # Os nomes dos valores que aparecem nas dimensões:
      # { 'professional_id' => { 'id1' => 'Nome 1' }, 'status' => { 'open' => 'Aberta' } }
      def resolve_labels(source, rows, dimension_fields, organization)
        dimension_fields.each_with_object({}) do |name, labels|
          if name.to_s.match?(CUSTOM_ATTR_FIELD)
            labels[name] = bucket_labels
            next
          end

          field = source.field(name)
          next unless field

          entries = value_labels(source, field)
          entries = entries.merge(id_labels(field, rows, organization)) if field.label_from
          labels[name] = entries if entries.any?
        end
      end

      # Os nomes das colunas do resultado, com os campos personalizados usados como dimensão.
      def field_labels(source, dimension_fields, organization)
        labels = source.fields.to_h { |field| [ field.key, source.field_label(field.key) ] }
        source.related_dimensions.each_key { |key| labels[key] = source.field_label(key) }

        keys = dimension_fields.filter_map { |name| name.to_s[CUSTOM_ATTR_FIELD, 1] }
        return labels if keys.empty?

        organization.custom_fields.where(:key.in => keys).each_with_object(labels) do |definition, result|
          result["custom_attributes.#{definition.key}"] = definition.name
        end
      end

      private

      def named_documents(scope, method_name)
        scope.order_by(created_at: :asc).map { |record| [ record.id.to_s, record.public_send(method_name) ] }
      end

      def named(kind, organization)
        NAMED.fetch(kind).call(organization)
      end

      def source_meta(source, account)
        {
          key: source.key,
          label: source.label,
          fields: source.fields.map { |field| field_meta(source, field) } + virtual_fields_meta(source, account),
          allowedMetrics: source.allowed_metrics,
          allowedDimensions: source.allowed_dimensions,
          relatedDimensions: source.related_dimensions.keys.map { |key| { key: key, label: source.field_label(key) } },
          supportsCustomAttributeDimensions: source.custom_attributes?
        }
      end

      def field_meta(source, field)
        meta = { key: field.key, label: source.field_label(field.key), type: field.type, enumValues: field.enum_values }
        meta[:filterType] = "relationship" if field.options_from
        meta[:filterType] = "custom_attribute" if field.custom_attribute?
        meta
      end

      # Campos virtuais: só filtro, nunca métrica nem dimensão.
      def virtual_fields_meta(source, account)
        document_filters_for(source, account).keys.map do |key|
          { key: key, label: source.field_label(key), type: "string", enumValues: nil, filterType: "relationship" }
        end
      end

      def document_filters_for(source, account)
        source.document_id_filters.select { |_, config| config[:permission].nil? || account.can?(config[:permission]) }
      end

      def document_filter_value_label(source, key, value)
        I18n.t("insights.custom_dashboards.sources.#{source.key}.values.#{key}.#{value}", default: value.to_s)
      end

      # `labels` em lista: o valor é a chave de tradução. Em mapa: valor => chave.
      def value_labels(source, field)
        return {} if field.labels.blank?

        mapping = field.labels.is_a?(Hash) ? field.labels : field.labels.index_with { |value| value }
        mapping.to_h do |value, translation|
          [ value, I18n.t("insights.custom_dashboards.sources.#{source.key}.values.#{field.key}.#{translation}", default: value.to_s) ]
        end
      end

      def id_labels(field, rows, organization)
        ids = rows.map { |row| row[field.key] }.compact.map(&:to_s).uniq
        return {} if ids.empty?

        named(field.label_from, organization).to_h.slice(*ids)
      end

      def bucket_labels
        {
          EMPTY_BUCKET => I18n.t("insights.custom_dashboards.buckets.empty"),
          INVALID_BUCKET => I18n.t("insights.custom_dashboards.buckets.invalid")
        }
      end
    end
  end
end
