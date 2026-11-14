module PieceDocument
  # O que está errado num documento, por caminho (`slides[2].blocks[0].slot`):
  # a tela marca o campo, o agente recebe a lista para corrigir. Um módulo só,
  # usado por todo endpoint que grava documento e pelo agente.
  #
  # `max_chars` é **aviso** para quem edita (o texto longo pode ser salvo e o
  # render corta) e **erro** no modo estrito — o do agente, que tem que
  # entregar a peça cabendo.
  class Validator
    Result = Struct.new(:errors, :warnings, keyword_init: true) do
      def valid? = errors.empty?

      def as_json(*)
        {
          "errors" => errors.map { |path, code, detail| { "path" => path, "code" => code, "detail" => detail }.compact },
          "warnings" => warnings.map { |path, code, detail| { "path" => path, "code" => code, "detail" => detail }.compact }
        }
      end
    end

    def self.call(document, brand_core:, strict: false)
      new(document, brand_core, strict).call
    end

    def initialize(document, brand_core, strict)
      @doc = document
      @brand = brand_core
      @strict = strict
      @errors = []
      @warnings = []
    end

    def call
      error("schemaVersion", "unsupported") unless @doc["schemaVersion"] == SCHEMA_VERSION
      format = @doc["format"].to_s
      if FORMATS.key?(format)
        error("canvas", "mismatch") unless @doc["canvas"] == FORMATS[format]
        check_slides(format)
      else
        error("format", "inclusion")
      end
      check_caption
      Result.new(errors: @errors, warnings: @warnings)
    end

    private

    def check_slides(format)
      slides = Array(@doc["slides"])
      if format == "carousel"
        error("slides", "carouselSize", "#{CAROUSEL_SLIDES.min}–#{CAROUSEL_SLIDES.max}") unless CAROUSEL_SLIDES.cover?(slides.length)
      elsif slides.length != 1
        error("slides", "singleSlide")
      end

      slides.each_with_index do |slide, index|
        check_slide(slide, index, slides.length, format)
      end
    end

    def check_slide(slide, index, total, format)
      path = "slides[#{index}]"
      contract = Layouts::Registry.find(slide["layoutId"])
      return error("#{path}.layoutId", "unknownLayout", slide["layoutId"].to_s) unless contract
      return error("#{path}.layoutId", "formatUnsupported", format) unless contract.supports?(format)

      case contract.position
      when "first" then error("#{path}.layoutId", "mustBeFirst") unless index.zero?
      when "last" then error("#{path}.layoutId", "mustBeLast") unless index == total - 1
      end

      check_background(slide["background"] || {}, contract, "#{path}.background")

      blocks = Array(slide["blocks"])
      blocks.each_with_index { |block, block_index| check_block(block, contract, "#{path}.blocks[#{block_index}]") }

      contract.required_slots.each do |slot|
        block = blocks.find { |b| b["slot"] == slot.id }
        next error("#{path}.slots.#{slot.id}", "requiredSlot") unless block
        next unless @strict

        empty = slot.text? ? block["content"].to_s.strip.empty? : (slot.image? && block["assetId"].blank?)
        error("#{path}.slots.#{slot.id}", slot.image? ? "requiredImage" : "blank") if empty
      end
    end

    def check_background(background, contract, path)
      type = background["type"].to_s
      return error("#{path}.type", "inclusion", contract.background_options.join("|")) unless contract.background_options.include?(type)

      if type == "color"
        error("#{path}.colorToken", "unknownToken", background["colorToken"].to_s) unless COLOR_TOKENS.key?(background["colorToken"].to_s)
      elsif background["assetId"].present?
        check_asset(background["assetId"], "#{path}.assetId")
      elsif @strict
        error("#{path}.assetId", "requiredImage")
      end
    end

    def check_block(block, contract, path)
      slot = contract.slot(block["slot"])
      return error("#{path}.slot", "unknownSlot", block["slot"].to_s) unless slot
      return error("#{path}.type", "typeMismatch", slot.type) unless block["type"] == slot.type

      case slot.type
      when "text"
        error("#{path}.styleRole", "unknownRole") unless STYLE_ROLES.key?(block["styleRole"].to_s)
        error("#{path}.sizeStep", "range") unless SIZE_STEPS.cover?(block["sizeStep"].to_i)
        options = contract.align_options.presence || [ contract.default_align ]
        error("#{path}.align", "inclusion", options.join("|")) unless options.include?(block["align"].to_s)
        check_length(block["content"].to_s, slot, "#{path}.content")
      when "image"
        check_asset(block["assetId"], "#{path}.assetId") if block["assetId"].present?
      when "logo"
        error("#{path}.variant", "inclusion") unless LOGO_VARIANTS.include?(block["variant"].to_s)
      end
    end

    def check_length(text, slot, path)
      if slot.max_chars && text.length > slot.max_chars
        flag("#{path}", "tooLong", "#{text.length}/#{slot.max_chars}")
      end
      lines = text.split("\n").length
      flag("#{path}", "tooManyLines", "#{lines}/#{slot.max_lines}") if slot.max_lines && lines > slot.max_lines
    end

    # Só imagem desta marca entra na peça — e nunca arquivo de fonte.
    def check_asset(id, path)
      return error(path, "invalidId") unless PieceDocument.uuid?(id)

      ok = @brand.assets.where.not(kind: "font").exists?(id: id)
      error(path, "foreignAsset") unless ok
    end

    def check_caption
      caption = @doc["caption"] || {}
      text = caption["text"].to_s
      flag("caption.text", "tooLong", "#{text.length}/#{CAPTION_MAX}") if text.length > CAPTION_MAX
      tags = Array(caption["hashtags"])
      flag("caption.hashtags", "tooMany", "#{tags.length}/#{HASHTAGS_MAX}") if tags.length > HASHTAGS_MAX
    end

    # Excesso de texto: aviso para quem edita, erro para o agente.
    def flag(path, code, detail = nil)
      (@strict ? @errors : @warnings) << [ path, code, detail ]
    end

    def error(path, code, detail = nil)
      @errors << [ path, code, detail ]
      nil
    end
  end
end
