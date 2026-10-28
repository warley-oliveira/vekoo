require "vips"

module PieceRenderers
  # O renderizador do servidor: interpreta a geometria do layout
  # (`layouts/*.yml`) sobre o tema resolvido e devolve um PNG por lâmina. O
  # outro intérprete da mesma geometria é o React (`components/piece-render`);
  # as regras de caixa, corte de texto e ponto focal são as mesmas dos dois
  # lados — mudar uma aqui é mudar lá.
  #
  # Função pura do documento + tema + arquivos: nada de hora, nada de sorte.
  class Libvips
    FADE_LINES = 1

    Line = Struct.new(:text, :width, keyword_init: true)

    def initialize(brand_core, theme: nil)
      @brand = brand_core
      @theme = theme || PieceDocument::Theme.call(brand_core)
      @tokens = Engines::Tokens.new(brand_core)
      @images = {}
      @fontfiles = {}
      @measures = {}
    end

    attr_reader :theme

    # Um PNG por lâmina, na ordem do documento.
    def render(document)
      slides = Array(document["slides"])
      slides.each_with_index.map { |slide, index|
        { "slideId" => slide["id"], "png" => render_slide(document, slide, index, slides.length) }
      }
    end

    def render_slide(document, slide, index, total)
      canvas = document["canvas"]
      @w = canvas["width"].to_i
      @h = canvas["height"].to_i
      contract = Layouts::Registry.find(slide["layoutId"]) or raise ArgumentError, "layout #{slide['layoutId']}"
      @slide = slide
      @blocks = Array(slide["blocks"]).index_by { |block| block["slot"] }
      @token = slide.dig("background", "colorToken").presence || "primary"
      @index = index
      @total = total

      image = solid(@w, @h, @theme["colors"][@token])
      contract.layers_for(document["format"]).each do |layer|
        image = paint(image, layer, contract)
      end
      image.flatten.cast(:uchar).write_to_buffer(".png")
    end

    private

    # ------------------------------------------------------------- camadas

    def paint(image, layer, contract)
      case layer["kind"]
      when "fill" then paint_fill(image, layer)
      when "image" then paint_image(image, layer)
      when "scrim" then paint_scrim(image, layer)
      when "logo" then paint_logo(image, layer)
      when "stack" then paint_stack(image, layer, contract)
      when "quote_mark" then paint_glyph(image, layer, "“", role: "display", color: @theme["accent"])
      when "swipe_hint" then paint_glyph(image, layer, layer["text"].to_s, role: "label", color: label_ink(false))
      when "slide_number" then paint_glyph(image, layer, format("%02d/%02d", @index + 1, @total), role: "label", color: label_ink(false))
      else image
      end
    end

    def paint_fill(image, layer)
      box = Layouts::Geometry.box(layer["box"], @w, @h)
      composite(image, solid(box.w.round, box.h.round, @theme["colors"][@token]), box.x, box.y)
    end

    def paint_image(image, layer)
      block = @blocks[layer["slot"]]
      return image if block.nil? || block["visible"] == false
      # Arrastada, a foto mora no `frame`; senão, na caixa do layout.
      box = frame_box(block) || Layouts::Geometry.box(layer["box"], @w, @h)
      source = block["assetId"] && load_asset(block["assetId"])

      unless source
        return image if layer["optional"]

        # Espaço reservado: a tinta do fundo a 10% — sem texto inventado.
        return composite(image, solid(box.w.round, box.h.round, @theme["ink"][@token], alpha: 0.1), box.x, box.y)
      end

      composite(image, PieceRenderers.cover(source, box.w.round, box.h.round, block["focalPoint"]), box.x, box.y)
    end

    # Escurecimento em degradê, da borda (`from`) para dentro.
    def paint_scrim(image, layer)
      return image if layer["when"] == "image" && !image_present?

      box = Layouts::Geometry.box(layer["box"], @w, @h)
      w = box.w.round
      h = box.h.round
      y = box.y || (@h - layer.dig("box", "bottom").to_f - h)
      ramp = ::Vips::Image.xyz(w, h)[1] / [ h - 1, 1 ].max.to_f
      ramp = ramp * -1 + 1 if layer["from"] == "top"
      alpha = (ramp**1.4) * (layer["opacity"].to_f * 255)
      layer_image = ::Vips::Image.black(w, h, bands: 3).bandjoin(alpha).cast(:uchar).copy(interpretation: :srgb)
      composite(image, layer_image, box.x || 0, y)
    end

    def paint_logo(image, layer)
      block = @blocks[layer["slot"]]
      return image if block.nil? || block["visible"] == false

      variant = block["variant"] == "light" ? "light" : "dark"
      entry = @theme["logo"][variant] || @theme["logo"][variant == "light" ? "dark" : "light"]
      source = entry && load_asset(entry["assetId"])
      return image unless source

      frame = block["frame"]
      height = (frame && frame["h"] || layer["height"]).to_f
      logo = rgba(source).resize(height / source.height)
      x, y = frame ? [ frame["x"], frame["y"] ] : anchored(layer["box"], logo.width, logo.height)
      composite(image, logo, x, y)
    end

    def paint_stack(image, layer, contract)
      box = Layouts::Geometry.box(layer["box"], @w, @h)
      top, right, bottom, left = Layouts::Geometry.inset(layer["inset"])
      on_image = case layer["ink"]
      when "image" then true
      when "auto" then image_present?
      else false
      end

      x = box.x + left
      width = (box.w || (@w - box.x - box.edges["right"].to_f)) - left - right
      gap = layer["gap"].to_f

      # Cada item: as linhas já quebradas e cortadas, e a altura que ocupa.
      items = Array(layer["items"]).filter_map { |item|
        block = @blocks[item["slot"]]
        next if block.nil? || block["visible"] == false || block["content"].to_s.strip.empty?

        slot = contract.slot(item["slot"])
        role = @theme["roles"][block["styleRole"]] || @theme["roles"]["body"]
        size = Layouts::Geometry.size_for(item["size"].to_f, block["sizeStep"])
        text = role["transform"] == "uppercase" ? block["content"].upcase : block["content"]
        lines, cut = wrap(text, role, size, width, slot&.max_lines)
        line_height = size * role["lineHeight"]
        color = block["styleRole"] == "label" ? label_ink(on_image) : (on_image ? @theme["imageInk"] : @theme["ink"][@token])
        frame = block["frame"]
        # Arrastado: quebra na largura do `frame`, não na da pilha.
        lines, cut = wrap(text, role, size, frame["w"], slot&.max_lines) if frame
        { lines: lines, cut: cut, role: role, size: size, line_height: line_height,
          height: lines.length * line_height, color: color, align: block["align"],
          gap: item.key?("gap") ? item["gap"].to_f : gap, frame: frame }
      }
      # Quem foi arrastado sai do fluxo da pilha e é desenhado no `frame`,
      # na mesma camada (a mesma ordem de sobreposição).
      free, items = items.partition { |item| item[:frame] }
      free.each { |item| image = draw_lines(image, item, item[:frame]["x"], item[:frame]["y"], item[:frame]["w"]) }
      return image if items.empty?

      total = items.sum { |item| item[:height] } + items.drop(1).sum { |item| item[:gap] }
      y =
        case layer["anchor"]
        when "bottom" then (box.y ? box.y + box.h : @h - box.edges["bottom"].to_f) - bottom - total
        when "center"
          area_top = box.y + top
          area_bottom = (box.h ? box.y + box.h : @h) - bottom
          area_top + ((area_bottom - area_top) - total) / 2.0
        else box.y + top
        end

      items.each_with_index do |item, position|
        y += item[:gap] if position.positive?
        image = draw_lines(image, item, x, y, width)
        y += item[:height]
      end
      image
    end

    def draw_lines(image, item, x, y, width)
      item[:lines].each_with_index do |line, line_index|
        mask = text_mask(line.text, item[:role], item[:size])
        line_x = item[:align] == "center" ? x + (width - mask.width) / 2.0 : x
        line_y = y + line_index * item[:line_height] + (item[:line_height] - mask.height) / 2.0
        fade = item[:cut] && line_index == item[:lines].length - 1
        image = composite(image, colorize(mask, item[:color], fade: fade), line_x, line_y)
      end
      image
    end

    def frame_box(block)
      frame = block["frame"]
      return nil unless frame && frame["h"]

      Layouts::Geometry::Box.new(x: frame["x"], y: frame["y"], w: frame["w"], h: frame["h"])
    end

    def paint_glyph(image, layer, text, role:, color:)
      return image if text.empty?

      spec = @theme["roles"][role]
      size = layer["size"].to_f
      body = spec["transform"] == "uppercase" ? text.upcase : text
      mask = text_mask(body, spec, size)
      x, y = anchored(layer["box"], mask.width, mask.height)
      composite(image, colorize(mask, color), x, y)
    end

    # --------------------------------------------------------------- texto

    # Quebra gulosa por palavra, como o navegador: cabe na linha, segue; não
    # cabe, quebra. Passou de `max_lines`, corta — a última linha esmaece.
    def wrap(text, role, size, width, max_lines)
      lines = []
      text.split("\n").each do |paragraph|
        words = paragraph.split(/\s+/).reject(&:empty?)
        next lines << Line.new(text: "", width: 0) if words.empty?

        current = words.shift
        words.each do |word|
          candidate = "#{current} #{word}"
          if measure(candidate, role, size) <= width
            current = candidate
          else
            lines << Line.new(text: current)
            current = word
          end
        end
        lines << Line.new(text: current)
      end
      return [ lines, false ] if max_lines.nil? || lines.length <= max_lines

      [ lines.first(max_lines), true ]
    end

    def measure(text, role, size)
      @measures[[ text, role["family"], role["weight"], size ]] ||= text_mask(text, role, size).width
    end

    def text_mask(text, role, size)
      fontfile = font_file(role)
      tracking = (role["tracking"].to_f * size * 1024).round
      markup = ERB::Util.html_escape(text)
      markup = %(<span letter_spacing="#{tracking}">#{markup}</span>) unless tracking.zero?
      options = { font: "#{role["family"]} #{Engines::Canvas::PANGO_WEIGHTS.fetch(role["weight"].to_i, "")} #{size.round}px".squeeze(" "), rgba: false }
      options[:fontfile] = fontfile if fontfile
      ::Vips::Image.text(markup.presence || " ", **options)
    end

    # O arquivo do peso certo: a fonte do catálogo baixa o peso mais próximo;
    # a enviada pela marca é o arquivo dela.
    def font_file(role)
      @fontfiles[[ role["font"], role["family"], role["weight"] ]] ||=
        BrandFonts.path(role["family"], role["weight"]) || @tokens.font(role["font"]).fontfile
    end

    # --------------------------------------------------------------- tinta

    def label_ink(on_image)
      on_image ? @theme["imageInk"] : @theme["accentInk"][@token]
    end

    def image_present?
      block = @blocks["image"]
      block && block["visible"] != false && block["assetId"].present? && load_asset(block["assetId"]).present?
    end

    # ------------------------------------------------------------- pixels

    def anchored(spec, width, height)
      spec = spec.to_h.stringify_keys
      x = spec["left"] ? spec["left"].to_f : @w - spec["right"].to_f - width
      y = spec["top"] ? spec["top"].to_f : @h - spec["bottom"].to_f - height
      [ x, y ]
    end

    def load_asset(id)
      return nil if id.blank?

      @images.fetch(id) do
        asset = @brand.assets.find_by(id: id)
        @images[id] = asset && begin
          ::Vips::Image.new_from_buffer(asset.file.download, "")
        rescue StandardError => e
          Rails.logger.warn("piece render: ativo #{id} não decodificou (#{e.class})")
          nil
        end
      end
    end

    def solid(width, height, hex, alpha: 1.0)
      r, g, b = BrandCore::Colors.rgb(hex)
      ::Vips::Image.black([ width, 1 ].max, [ height, 1 ].max, bands: 4)
        .new_from_image([ r, g, b, (alpha * 255).round ]).copy(interpretation: :srgb)
    end

    def colorize(mask, hex, fade: false)
      alpha = mask
      if fade
        ramp = ::Vips::Image.xyz(mask.width, mask.height)[1] / [ mask.height - 1, 1 ].max.to_f
        alpha = mask * (ramp * -1 + 1)
      end
      mask.new_from_image(BrandCore::Colors.rgb(hex)).bandjoin(alpha.cast(:uchar)).cast(:uchar).copy(interpretation: :srgb)
    end

    def rgba(image)
      image = image.colourspace(:srgb) unless image.interpretation == :srgb
      image = image.bandjoin(255) unless image.has_alpha?
      image
    end

    def composite(base, layer, x, y)
      base.composite2(rgba(layer), :over, x: x.round, y: y.round)
    end
  end
end
