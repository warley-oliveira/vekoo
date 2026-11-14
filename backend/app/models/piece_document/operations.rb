module PieceDocument
  # O vocabulário fechado de mudanças num documento — o mesmo para o painel
  # do editor e, na etapa da conversa, para o modelo. O espelho do front é
  # `lib/piece-operations.ts`: o editor aplica na hora (otimista) e o
  # servidor confere aqui o que chega por `POST /operations`.
  #
  # Cada operação é aplicada e **validada sozinha**: a que quebra o documento
  # é descartada com o motivo, as outras valem. Nunca se aplica JSON cru.
  module Operations
    # O que o painel e a conversa podem pedir.
    EDITOR = %w[
      set_text set_size_step set_align set_visible set_image set_focal_point set_frame set_background
      set_scrim set_layout set_logo move_slide set_caption add_slide remove_slide
    ].freeze

    # O que a conversa (etapa 7) pode pedir — sem criar nem apagar lâmina.
    CONVERSATION = (EDITOR - %w[add_slide remove_slide]).freeze

    # Nomes reservados para depois: recusados com motivo claro, não como
    # "operação desconhecida". Ponto de extensão da geração de imagem.
    RESERVED = %w[request_image].freeze

    Result = Struct.new(:document, :applied, :rejected, keyword_init: true)

    module_function

    def apply(document, operations, brand_core:, allowed: EDITOR)
      current = document.deep_dup
      applied = []
      rejected = []

      Array(operations).each do |raw|
        op = raw.to_h.deep_stringify_keys
        name = op["op"].to_s
        if RESERVED.include?(name)
          rejected << { "op" => op, "reason" => "reserved" }
          next
        end
        unless allowed.include?(name)
          rejected << { "op" => op, "reason" => "unknownOperation" }
          next
        end

        candidate = send(name, current.deep_dup, op)
        if candidate.is_a?(String)
          rejected << { "op" => op, "reason" => candidate }
          next
        end

        before = Validator.call(current, brand_core: brand_core).errors
        after = Validator.call(candidate, brand_core: brand_core).errors
        if (after - before).any?
          rejected << { "op" => op, "reason" => "invalid", "errors" => (after - before).map { |path, code, _| "#{path} #{code}" } }
        else
          current = candidate
          applied << op
        end
      end

      Result.new(document: current, applied: applied, rejected: rejected)
    end

    # ------------------------------------------------------------ texto

    def set_text(doc, op)
      with_block(doc, op, "text") { |block| block["content"] = op["content"].to_s.gsub("\r\n", "\n") }
    end

    def set_size_step(doc, op)
      with_block(doc, op, "text") { |block| block["sizeStep"] = op["sizeStep"].to_i.clamp(SIZE_STEPS.min, SIZE_STEPS.max) }
    end

    def set_align(doc, op)
      with_block(doc, op, "text") { |block| block["align"] = op["align"].to_s }
    end

    # Slot opcional que ainda não tem bloco ganha um, já visível.
    def set_visible(doc, op)
      with_block(doc, op, nil, create: true) { |block| block["visible"] = op["visible"] != false }
    end

    # ----------------------------------------------------------- imagem

    def set_image(doc, op)
      with_block(doc, op, "image", create: true) do |block|
        block["assetId"] = op["assetId"].presence
        block["focalPoint"] = PieceDocument.focal_point(op["focalPoint"]) if op.key?("focalPoint")
        block["visible"] = true
      end
    end

    # Arrastar dentro da foto: só o ponto focal muda.
    def set_focal_point(doc, op)
      with_block(doc, op, "image") { |block| block["focalPoint"] = PieceDocument.focal_point(op["focalPoint"]) }
    end

    # Arrastar o bloco para fora do lugar do layout (`frame`), ou devolvê-lo
    # (`frame: null`). A área segura é aplicada aqui, como na gravação.
    def set_frame(doc, op)
      with_block(doc, op, nil) do |block|
        frame = PieceDocument.normalize_frame(op["frame"], block["type"])
        if frame
          block["frame"] = PieceDocument.clamp_frame(frame, block["type"], doc["format"])
        else
          block.delete("frame")
        end
      end
    end

    def set_background(doc, op)
      with_slide(doc, op) do |slide, contract|
        type = op["type"].to_s
        return "backgroundUnsupported" unless contract.background_options.include?(type)
        # Token desconhecido é recusa, não troca silenciosa pelo padrão.
        return "unknownToken" if type == "color" && !COLOR_TOKENS.key?(op["colorToken"].to_s)

        slide["background"] = PieceDocument.normalize_background(op.slice("type", "colorToken", "assetId", "focalPoint"), contract)
      end
    end

    # `level` nulo (ou `default`) volta ao degradê do layout.
    def set_scrim(doc, op)
      with_slide(doc, op) do |slide, contract|
        next "scrimUnsupported" unless contract.layers_for(doc["format"]).any? { |layer| layer["kind"] == "scrim" }

        level = op["level"].to_s
        if level.empty? || level == "default"
          slide.delete("scrim")
        elsif SCRIM_LEVELS.include?(level)
          slide["scrim"] = level
        else
          next "invalid"
        end
        # Texto devolvido pelo bloco é motivo de recusa: o nível não pode vazar.
        nil
      end
    end

    def set_logo(doc, op)
      with_block(doc, op.merge("slot" => "logo"), "logo", create: true) do |block|
        block["visible"] = op["visible"] != false if op.key?("visible")
        block["variant"] = op["variant"].to_s if op.key?("variant")
      end
    end

    # ------------------------------------------------------------ layout

    # Troca o layout sem perder nada: os blocos de slots que o layout novo
    # tem ficam; os outros vão para `orphans`; órfão cujo slot voltou a
    # existir volta. A normalização faz a conta — a mesma regra de sempre.
    def set_layout(doc, op)
      with_slide(doc, op) do |slide, _contract|
        target = Layouts::Registry.find(op["layoutId"])
        return "unknownLayout" unless target
        return "formatUnsupported" unless target.supports?(doc["format"])

        # Layout novo, lugares novos: quem tinha sido arrastado volta ao slot.
        pool = (slide["blocks"] + slide["orphans"]).map { |block| block.except("frame") }
        background = target.background_options.include?(slide.dig("background", "type")) ? slide["background"] : nil
        normalized = PieceDocument.normalize_slide(
          "id" => slide["id"], "layoutId" => target.id, "background" => background, "blocks" => pool, "orphans" => []
        )
        slide.replace(normalized)
      end
    end

    # ------------------------------------------------------------ lâminas

    def move_slide(doc, op)
      slides = doc["slides"]
      from = slides.index { |slide| slide["id"] == op["slideId"] }
      return "unknownSlide" unless from

      to = op["toIndex"].to_i.clamp(0, slides.length - 1)
      slides.insert(to, slides.delete_at(from))
      doc
    end

    def add_slide(doc, op)
      slides = doc["slides"]
      after = op["afterSlideId"] ? slides.index { |slide| slide["id"] == op["afterSlideId"] } : slides.length - 1
      return "unknownSlide" unless after

      slide = PieceDocument.normalize_slide("layoutId" => op["layoutId"].to_s, "blocks" => Array(op["blocks"]))
      slides.insert(after + 1, slide)
      doc
    end

    def remove_slide(doc, op)
      index = doc["slides"].index { |slide| slide["id"] == op["slideId"] }
      return "unknownSlide" unless index

      doc["slides"].delete_at(index)
      doc
    end

    # ------------------------------------------------------------ legenda

    def set_caption(doc, op)
      caption = doc["caption"].merge(op.slice("text", "hashtags"))
      doc["caption"] = PieceDocument.normalize_caption(caption)
      doc
    end

    # ------------------------------------------------------------ apoio

    def with_slide(doc, op)
      slide = doc["slides"].find { |s| s["id"] == op["slideId"] }
      return "unknownSlide" unless slide

      contract = Layouts::Registry.find(slide["layoutId"])
      return "unknownLayout" unless contract

      result = yield(slide, contract)
      result.is_a?(String) ? result : doc
    end

    def with_block(doc, op, type, create: false)
      with_slide(doc, op) do |slide, contract|
        slot = contract.slot(op["slot"])
        next "unknownSlot" unless slot
        next "typeMismatch" if type && slot.type != type

        block = slide["blocks"].find { |b| b["slot"] == slot.id }
        if block.nil?
          next "unknownSlot" unless create

          block = PieceDocument.normalize_block({ "slot" => slot.id }, contract)
          slide["blocks"] << block
          slide["blocks"].sort_by! { |b| contract.slots.keys.index(b["slot"]) || 99 }
        end
        yield block
        nil
      end
    end
  end
end
