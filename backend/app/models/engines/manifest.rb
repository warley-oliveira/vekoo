# A ficha técnica de um motor, lida de `engines/<id>/manifest.yml` e validada
# na entrada: um manifesto errado derruba o boot em vez de virar formulário
# quebrado na tela.
#
# Chaves em inglês/camelCase, como todo o resto da API — o arquivo é a mesma
# forma que sai em `GET /engines`. Textos visíveis (`name`, `description`,
# `label`, `hint`) aceitam string ou `{ pt-BR:, en: }`.
module Engines
  class Manifest
    FORMATS = %w[post story].freeze
    DIMENSIONS = { "post" => [ 1080, 1350 ], "story" => [ 1080, 1920 ] }.freeze
    FIELD_TYPES = %w[text textList number choice image].freeze
    IMAGE_KINDS = %w[photo logo glyph].freeze
    # De onde uma `choice` pode derivar as opções no Brandcore do cliente.
    CHOICE_SOURCES = %w[palette.backgrounds palette.accents palette.colors].freeze
    CONSTRAINT_KEYS = %w[maxLines maxCharsPerLine maxChars maxItems min max].freeze

    Field = Struct.new(:id, :type, :required, :label, :hint, :constraints, :options, :source, :kinds, :default, keyword_init: true) do
      def choice? = type == "choice"
      def image? = type == "image"
      def derived? = choice? && source.present?
    end

    attr_reader :id, :name, :description, :formats, :fields, :series

    def self.load(path, expected_id:)
      raw = YAML.safe_load_file(path, permitted_classes: [], aliases: false) || {}
      new(raw, expected_id: expected_id)
    rescue Psych::SyntaxError => e
      raise InvalidManifest, "#{path}: YAML inválido (#{e.message})"
    end

    def initialize(raw, expected_id: nil)
      raw = raw.deep_stringify_keys
      @id = raw["id"].to_s
      @name = raw["name"]
      @description = raw["description"]
      @formats = Array(raw["formats"]).map(&:to_s)
      @series = raw["series"] == true
      @fields = Array(raw["fields"]).map { |field| build_field(field) }
      validate!(expected_id)
    end

    def supports?(format)
      formats.include?(format.to_s)
    end

    def field(field_id)
      fields.find { |field| field.id == field_id.to_s }
    end

    def dimensions(format)
      DIMENSIONS.fetch(format.to_s)
    end

    # O JSON do catálogo, já no idioma da requisição.
    def as_json(locale: I18n.locale)
      {
        "id" => id,
        "name" => localize(name, locale),
        "description" => localize(description, locale),
        "formats" => formats,
        "series" => series,
        "fields" => fields.map { |field|
          {
            "id" => field.id,
            "type" => field.type,
            "required" => field.required,
            "label" => localize(field.label, locale),
            "hint" => localize(field.hint, locale),
            "constraints" => field.constraints,
            "options" => field.options&.map { |option|
              { "id" => option["id"], "label" => localize(option["label"], locale) }
            },
            "source" => field.source,
            "kinds" => field.kinds,
            "default" => field.default
          }.compact
        }
      }
    end

    private

    def build_field(raw)
      raw = raw.deep_stringify_keys
      Field.new(
        id: raw["id"].to_s,
        type: raw["type"].to_s,
        required: raw["required"] == true,
        label: raw["label"],
        hint: raw["hint"],
        constraints: (raw["constraints"] || {}).slice(*CONSTRAINT_KEYS),
        options: raw["options"]&.map { |o| o.is_a?(Hash) ? o.deep_stringify_keys : { "id" => o.to_s, "label" => o.to_s } },
        source: raw["source"],
        kinds: raw["kinds"]&.map(&:to_s),
        default: raw["default"]
      )
    end

    def validate!(expected_id)
      fail!("id em branco") if id.blank?
      fail!("id '#{id}' não bate com o diretório '#{expected_id}'") if expected_id && id != expected_id
      fail!("id '#{id}' deve ser snake_case") unless id.match?(/\A[a-z][a-z0-9_]*\z/)
      fail!("name em branco") if localize(name, :"pt-BR").blank?
      fail!("formats deve conter post e/ou story") if formats.empty? || (formats - FORMATS).any?
      fail!("fields vazio") if fields.empty?

      ids = fields.map(&:id)
      fail!("ids de campo repetidos: #{ids.tally.select { |_, n| n > 1 }.keys.join(', ')}") if ids.uniq.length != ids.length

      fields.each { |field| validate_field!(field) }
    end

    def validate_field!(field)
      fail!("campo sem id") if field.id.blank?
      fail!("campo #{field.id}: tipo '#{field.type}' desconhecido") unless FIELD_TYPES.include?(field.type)
      fail!("campo #{field.id}: label em branco") if localize(field.label, :"pt-BR").blank?
      field.constraints.each do |key, value|
        fail!("campo #{field.id}: restrição #{key} deve ser número") unless value.is_a?(Numeric)
      end
      case field.type
      when "choice"
        if field.source
          fail!("campo #{field.id}: source '#{field.source}' desconhecido") unless CHOICE_SOURCES.include?(field.source)
        else
          fail!("campo #{field.id}: choice precisa de options ou source") if field.options.blank?
        end
      when "image"
        kinds = field.kinds || [ "photo" ]
        fail!("campo #{field.id}: kinds de imagem inválidos") if (kinds - IMAGE_KINDS).any?
      end
    end

    def fail!(message)
      raise InvalidManifest, "manifesto #{id.presence || '?'}: #{message}"
    end

    def localize(value, locale)
      return value.to_s if value.is_a?(String) || value.nil?

      value = value.deep_stringify_keys
      value[locale.to_s] || value["pt-BR"] || value.values.first.to_s
    end
  end
end
