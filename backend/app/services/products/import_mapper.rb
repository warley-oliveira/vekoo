module Products
  # Converte uma linha do CSV em atributos de Products::Item, segundo o mapeamento
  # escolhido pela pessoa.
  #
  # `mapping` é { 'coluna do csv' => 'alvo' }, onde alvo é um campo nativo
  # ('title', 'summary', 'description', 'external_id', 'url', 'active',
  # 'categories', 'tags', 'images') ou 'custom:<key>' de uma Products::FieldDefinition.
  class ImportMapper
    NATIVE_FIELDS = %w[title summary description external_id url active].freeze
    SPECIAL_FIELDS = %w[categories tags images].freeze
    CUSTOM_PREFIX = "custom:"
    # Separador de valores múltiplos numa única célula (tags, categorias, imagens).
    MULTI_SEPARATOR = /[|;]/

    # Auto-detecção por substring do cabeçalho já normalizado (sem acento, minúsculo).
    SUGGESTIONS = {
      "title" => /nome|titulo|title|produto|item|descricao curta/i,
      "external_id" => /sku|codigo|code|referencia|ref\b|id externo/i,
      "summary" => /resumo|summary|subtitulo|chamada/i,
      "description" => /descricao|description|detalhe|texto/i,
      "url" => /url|link|pagina|site/i,
      "categories" => /categoria|category|secao|departamento/i,
      "tags" => /tag|etiqueta|marcador|palavra.?chave/i,
      "images" => /imagem|image|foto|photo|picture/i,
      "active" => /ativo|active|disponivel|status/i
    }.freeze

    Row = Struct.new(:attributes, :categories, :tags, :images, :errors, keyword_init: true) do
      def valid?
        errors.empty?
      end
    end

    # Coluna -> alvo sugerido, cada alvo no máximo uma vez.
    def self.suggest(headers)
      used = []
      headers.each_with_object({}) do |header, suggestions|
        normalized = IndexTextBuilder.normalize(header)
        target, = SUGGESTIONS.find { |candidate, pattern| !used.include?(candidate) && normalized.match?(pattern) }
        next unless target

        used << target
        suggestions[header] = target
      end
    end

    # O que a tela oferece para cada coluna: os campos nativos e os da organização.
    def self.targets(organization_id)
      native = (NATIVE_FIELDS + SPECIAL_FIELDS).map do |field|
        { value: field, label: I18n.t("products.imports.targets.#{field}"), kind: "native" }
      end
      custom = FieldDefinition.for_organization(organization_id).ordered.map do |definition|
        { value: "#{CUSTOM_PREFIX}#{definition.key}", label: definition.name, kind: "custom", valueType: definition.value_type }
      end

      native + custom
    end

    def initialize(organization_id, mapping, definitions: nil)
      @organization_id = organization_id
      @mapping = (mapping || {}).to_h.transform_keys(&:to_s).transform_values(&:to_s)
      @definitions = definitions
    end

    def call(csv_row)
      attributes = { "organization_id" => @organization_id, "active" => true }
      custom = {}
      categories = []
      tags = []
      images = []
      errors = []

      @mapping.each do |column, target|
        next if target.blank?

        value = csv_row[column]
        next if value.nil?

        value = value.to_s.strip
        case target
        when "active" then attributes["active"] = FieldDefinition.truthy?(value)
        # Um `javascript:` vindo da planilha não pode virar `href` na tela. Vai como vazio:
        # o resto da linha continua bom.
        when "url" then attributes["url"] = (value if Products.web_url?(value))
        when *NATIVE_FIELDS then attributes[target] = value.presence
        when "categories" then categories.concat(split_multi(value))
        when "tags" then tags.concat(split_multi(value))
        when "images" then images.concat(split_multi(value).select { |url| Products.web_url?(url) })
        else
          key = custom_key(target)
          next unless key

          definition = definitions_by_key[key]
          unless definition
            errors << I18n.t("products.imports.row_errors.unknown_field", key: key)
            next
          end
          casted = definition.cast(value)
          custom[key] = casted unless casted.nil?
        end
      end

      attributes["custom_fields"] = custom
      attributes["title"] = attributes["title"].to_s.truncate(Item::TITLE_MAX_LENGTH)
      attributes["summary"] = attributes["summary"]&.truncate(Item::SUMMARY_MAX_LENGTH)
      errors << I18n.t("products.imports.row_errors.title_blank") if attributes["title"].blank?
      errors << I18n.t("products.imports.row_errors.custom_fields_too_large") if custom.to_json.bytesize > Item::MAX_CUSTOM_FIELDS_BYTES

      Row.new(attributes: attributes, categories: categories.uniq, tags: tags.uniq.first(Item::MAX_TAGS),
        images: images.uniq, errors: errors)
    end

    # Uma linha só sobrescreve `active` se a planilha trouxer a coluna. Sem ela, reimportar
    # uma tabela de preços reativaria o que a pessoa tinha desativado à mão.
    def maps_active?
      @mapping.values.include?("active")
    end

    def definitions_by_key
      @definitions_by_key ||= (@definitions || FieldDefinition.for_organization(@organization_id)).index_by(&:key)
    end

    private

    def custom_key(target)
      return nil unless target.start_with?(CUSTOM_PREFIX)

      target.delete_prefix(CUSTOM_PREFIX).presence
    end

    def split_multi(value)
      value.split(MULTI_SEPARATOR).map(&:strip).reject(&:blank?)
    end
  end
end
