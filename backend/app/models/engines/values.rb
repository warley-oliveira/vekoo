# Os valores dos campos de uma peça, conferidos contra o manifesto do motor e
# contra o Brandcore do cliente (opções derivadas, refs e ativos existem?).
# Devolve os valores normalizados e os erros por caminho (`values.frase`),
# no mesmo formato de validação do resto da API.
module Engines
  class Values
    Result = Struct.new(:values, :errors, keyword_init: true) do
      def valid? = errors.empty?
    end

    def self.call(manifest, raw, tokens:)
      new(manifest, raw, tokens).call
    end

    def initialize(manifest, raw, tokens)
      @manifest = manifest
      @raw = (raw || {}).to_h.deep_stringify_keys
      @tokens = tokens
      @errors = []
    end

    def call
      values = @manifest.fields.each_with_object({}) do |field, acc|
        value = normalize(field, @raw[field.id])
        acc[field.id] = value unless value.nil?
      end
      Result.new(values: values, errors: @errors)
    end

    private

    def normalize(field, value)
      value = field.default if value.nil? || (value.respond_to?(:empty?) && value.empty?)
      if blank?(value)
        @errors << [ path(field), :blank ] if field.required
        return nil
      end

      case field.type
      when "text" then text(field, value)
      when "textList" then text_list(field, value)
      when "number" then number(field, value)
      when "choice" then choice(field, value)
      when "ref" then ref(field, value)
      when "image" then image(field, value)
      end
    end

    # `maxLines` conta linhas **efetivas**: a quebra manual mais a automática
    # que `maxCharsPerLine` implica — a pessoa não precisa quebrar à mão para
    # o texto caber, só não pode passar do que a peça comporta.
    def text(field, value)
      value = value.to_s.strip
      c = field.constraints
      lines = value.split("\n").map(&:strip)
      @errors << [ path(field), :too_long ] if c["maxChars"] && value.length > c["maxChars"]
      if c["maxLines"] && effective_lines(lines, c["maxCharsPerLine"]) > c["maxLines"]
        @errors << [ path(field), :too_many_lines ]
      end
      lines.join("\n")
    end

    def self.effective_lines(lines, per_line)
      lines.sum { |line| per_line ? [ (line.length.to_f / per_line).ceil, 1 ].max : 1 }
    end

    def effective_lines(lines, per_line)
      self.class.effective_lines(lines, per_line)
    end

    def text_list(field, value)
      list = Array(value).map { |item| item.to_s.strip }.reject(&:empty?)
      c = field.constraints
      @errors << [ path(field), :too_many_items ] if c["maxItems"] && list.length > c["maxItems"]
      @errors << [ path(field), :too_long ] if c["maxChars"] && list.any? { |item| item.length > c["maxChars"] }
      list
    end

    def number(field, value)
      number = Integer(value, exception: false) || Float(value, exception: false)
      return @errors << [ path(field), :not_a_number ] && nil unless number

      c = field.constraints
      @errors << [ path(field), :too_small ] if c["min"] && number < c["min"]
      @errors << [ path(field), :too_large ] if c["max"] && number > c["max"]
      number
    end

    def choice(field, value)
      value = value.to_s
      allowed = field.derived? ? derived_ids(field.source) : field.options.map { |o| o["id"] }
      return value if allowed.include?(value)

      @errors << [ path(field), :inclusion ]
      nil
    end

    def ref(field, value)
      fact = @tokens.fact(value)
      return value.to_s if fact && field.kinds.include?(fact["kind"])

      @errors << [ path(field), :inclusion ]
      nil
    end

    def image(field, value)
      kinds = field.kinds || [ "photo" ]
      return value.to_s if @tokens.brand_core.assets.exists?(id: value.to_s, kind: kinds)

      @errors << [ path(field), :inclusion ]
      nil
    end

    def derived_ids(source)
      case source
      when "palette.backgrounds" then @tokens.backgrounds
      when "palette.accents" then @tokens.accents
      else @tokens.colors
      end.map { |c| c["id"] }
    end

    def blank?(value)
      value.nil? || (value.respond_to?(:empty?) && value.empty?) || (value.is_a?(String) && value.strip.empty?)
    end

    def path(field)
      "values.#{field.id}"
    end
  end
end
