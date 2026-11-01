module PieceDocument
  # O tamanho da letra do miolo do carrossel. Texto curto num `carousel-body`
  # deixava ~64% da lâmina vazia; aqui a letra cresce até dois degraus
  # (`sizeStep`) enquanto o texto couber.
  #
  # Decide **uma vez por carrossel**, pela lâmina que mais ocupa, e aplica o
  # mesmo degrau em todas as lâminas do miolo — tamanho variando de lâmina a
  # lâmina quebra a unidade igual a cor quebrava. O degrau vai para o
  # documento: os dois renderizadores já o respeitam e a pessoa ajusta no
  # editor.
  module Fit
    LAYOUT = "carousel-body"
    STEPS = [ 2, 1, 0 ].freeze
    # O texto do miolo cabe com folga: até 90% da caixa da pilha.
    ROOM = 0.9

    module_function

    # `slides`: as lâminas ainda na forma do `Build` (blocos com `slot` e
    # `content`). `measurer`: quem mede o texto na fonte da marca
    # (`PieceRenderers::Libvips#text_height`).
    def carousel!(slides, measurer:)
      middle = Array(slides[1...-1]).select { |slide| slide["layoutId"] == LAYOUT }
      return slides if middle.empty?

      step = step_for(middle, measurer)
      middle.each do |slide|
        slide["blocks"].each { |block| block["sizeStep"] = step if block.key?("content") }
      end
      slides
    end

    def step_for(middle, measurer)
      contract = Layouts::Registry.find(LAYOUT)
      canvas = PieceDocument.canvas_for("carousel")
      layer = contract.layers_for("carousel").find { |item| item["kind"] == "stack" }
      box = Layouts::Geometry.box(layer["box"], canvas["width"], canvas["height"])
      top, right, bottom, left = Layouts::Geometry.inset(layer["inset"])
      width = box.w - left - right
      room = (box.h - top - bottom) * ROOM

      STEPS.find { |step| middle.all? { |slide| fits?(slide, layer, contract, step, width, room, measurer) } } || 0
    rescue StandardError => e
      # Sem medir, a letra fica no tamanho do layout: nunca derruba a peça.
      Rails.logger.warn("fit: #{e.class}: #{e.message.to_s.first(160)}")
      0
    end

    def fits?(slide, layer, contract, step, width, room, measurer)
      blocks = slide["blocks"].to_h { |block| [ block["slot"], block ] }
      items = Array(layer["items"]).filter_map { |item|
        text = blocks.dig(item["slot"], "content").to_s.strip
        next if text.empty?

        slot = contract.slot(item["slot"])
        size = Layouts::Geometry.size_for(item["size"].to_f, step)
        height, cut = measurer.text_height(text, slot.role_default, size, width, slot.max_lines)
        return false if cut

        height
      }
      items.sum + [ items.length - 1, 0 ].max * layer["gap"].to_f <= room
    end
  end
end
