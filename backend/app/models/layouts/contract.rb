module Layouts
  # O contrato de um layout (`layouts/<id>.yml`): slots, formatos e opções.
  # Imutável depois de carregado; quem valida documento, quem monta o
  # catálogo do agente e quem responde `GET /layouts` lê daqui.
  class Contract
    SLOT_TYPES = %w[text image logo].freeze
    BACKGROUNDS = %w[image color].freeze
    ALIGNS = %w[left center].freeze
    POSITIONS = %w[first last].freeze

    Slot = Struct.new(:id, :type, :required, :role_default, :max_chars, :max_lines, :default_visible, keyword_init: true) do
      def text? = type == "text"
      def image? = type == "image"
      def logo? = type == "logo"
      def required? = required == true

      def as_json(*)
        {
          "id" => id, "type" => type, "required" => required?,
          "roleDefault" => role_default, "maxChars" => max_chars, "maxLines" => max_lines,
          "defaultVisible" => default_visible
        }.compact
      end
    end

    attr_reader :id, :formats, :position, :background_options, :background_default, :align_options, :slots, :geometry

    def self.load(path)
      raw = YAML.safe_load_file(path)
      new(raw, expected_id: File.basename(path, ".yml"))
    rescue Psych::Exception => e
      raise InvalidContract, "layout #{File.basename(path)}: YAML inválido (#{e.message})"
    end

    def initialize(raw, expected_id:)
      @raw = raw
      @id = raw["id"].to_s
      fail!("o id '#{@id}' precisa ser o nome do arquivo (#{expected_id})") unless @id == expected_id
      @formats = Array(raw["formats"]).map(&:to_s)
      fail!("formato desconhecido em #{@formats}") if @formats.empty? || (@formats - PieceDocument::FORMATS.keys).any?
      @position = raw["position"]&.to_s
      fail!("posição '#{@position}' desconhecida") if @position && !POSITIONS.include?(@position)
      fail!("posição só existe em layout de carrossel") if @position && @formats != [ "carousel" ]
      @background_options = Array(raw["background_options"]).map(&:to_s)
      fail!("background_options inválido") if @background_options.empty? || (@background_options - BACKGROUNDS).any?
      @background_default = (raw["background_default"] || {}).transform_keys(&:to_s)
      @align_options = Array(raw["align_options"]).map(&:to_s)
      fail!("align_options inválido") if (@align_options - ALIGNS).any?
      @slots = build_slots(raw["slots"])
      @geometry = build_geometry(raw["geometry"])
      freeze
    end

    def supports?(format) = formats.include?(format.to_s)
    def slot(id) = slots[id.to_s]
    def required_slots = slots.values.select(&:required?)
    def name(locale = I18n.locale) = localized(@raw["name"], locale)
    def description(locale = I18n.locale) = localized(@raw["description"], locale)
    def default_align = align_options.first || "left"

    # As camadas do desenho neste formato (o bloco do formato, ou `default`).
    def layers_for(format) = geometry[format.to_s] || geometry.fetch("default")

    # O fundo com que um slide nasce neste layout.
    def default_background
      type = background_default["type"].presence || background_options.first
      { "type" => type, "colorToken" => background_default["color_token"].presence }.compact
    end

    def as_json(locale: I18n.locale)
      {
        "id" => id,
        "name" => name(locale),
        "description" => description(locale),
        "formats" => formats,
        "position" => position,
        "backgroundOptions" => background_options,
        "backgroundDefault" => default_background,
        "alignOptions" => align_options,
        "slots" => slots.values.map(&:as_json),
        "geometry" => geometry
      }.compact
    end

    private

    def build_slots(raw)
      fail!("sem slots") unless raw.is_a?(Hash) && raw.any?

      raw.to_h { |slot_id, spec|
        spec = (spec || {}).transform_keys(&:to_s)
        type = spec["type"].to_s
        fail!("slot #{slot_id}: tipo '#{type}' desconhecido") unless SLOT_TYPES.include?(type)
        role = spec["role_default"]&.to_s
        fail!("slot #{slot_id}: papel '#{role}' desconhecido") if type == "text" && !PieceDocument::STYLE_ROLES.include?(role)

        [ slot_id.to_s, Slot.new(
          id: slot_id.to_s, type: type, required: spec["required"] == true, role_default: role,
          max_chars: spec["max_chars"]&.to_i, max_lines: spec["max_lines"]&.to_i,
          default_visible: type == "logo" ? spec.fetch("default_visible", true) : nil
        ) ]
      }
    end

    def build_geometry(raw)
      fail!("sem geometry.default") unless raw.is_a?(Hash) && raw["default"].is_a?(Array)
      unknown = raw.keys.map(&:to_s) - [ "default" ] - formats
      fail!("geometry para formato que o layout não declara: #{unknown}") if unknown.any?

      raw.to_h { |format, layers| [ format.to_s, Geometry.validate!(layers, @id, @slots).freeze ] }.freeze
    end

    def localized(value, locale)
      return value.to_s unless value.is_a?(Hash)

      value[locale.to_s] || value["pt-BR"] || value.values.first
    end

    def fail!(message)
      raise InvalidContract, "layout #{@id.presence || '?'}: #{message}"
    end
  end
end
