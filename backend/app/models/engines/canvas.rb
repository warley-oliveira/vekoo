require "vips"

# A tela de composição de um quadro: canvas → blocos de cor → texto → ativos,
# camada sobre camada, no libvips. É a única coisa que sabe desenhar; os
# motores só dizem o quê e onde, em papéis do Brandcore.
#
# Os tamanhos da hierarquia de estilos são pensados para o card do editor
# (~430 px de largura); aqui o canvas tem 1080, então tudo escala por SCALE.
module Engines
  class Canvas
    SCALE = 2.5
    LINE_HEIGHT = 1.12
    MIN_SHRINK = 0.5

    PANGO_WEIGHTS = {
      100 => "Thin", 200 => "Extra-Light", 300 => "Light", 400 => "", 500 => "Medium",
      600 => "Semi-Bold", 700 => "Bold", 800 => "Extra-Bold", 900 => "Black"
    }.freeze

    attr_reader :width, :height, :tokens

    def initialize(width:, height:, tokens:)
      @width = width
      @height = height
      @tokens = tokens
      @image = solid(width, height, "#000000")
    end

    # ---------------------------------------------------------------- cor

    def fill(hex)
      @image = solid(width, height, hex)
    end

    def rect(x, y, w, h, hex, radius: 0, opacity: 1.0)
      return if w <= 0 || h <= 0

      mask = radius.positive? ? rounded_mask(w, h, [ radius, w / 2, h / 2 ].min) : flat_mask(w, h)
      composite(colorize(mask, hex, opacity), x, y)
    end

    def circle(cx, cy, radius, hex, opacity: 1.0)
      size = radius * 2
      mask = Vips::Image.black(size, size).draw_circle(255, radius, radius, radius, fill: true)
      composite(colorize(mask, hex, opacity), cx - radius, cy - radius)
    end

    def line(x, y, w, h, hex)
      rect(x, y, w, h, hex)
    end

    # -------------------------------------------------------------- texto

    # Desenha texto com o estilo da hierarquia (`style: "title"`), ou com
    # tamanho/peso/fonte explícitos. Devolve [largura, altura] do bloco.
    #
    # `max_lines` + `fit` encolhem a fonte até caber (frase de impacto em até
    # quatro linhas, número gigante que não estoura a largura).
    def text(str, x:, y:, width:, color:, style: nil, size: nil, weight: nil, font_role: nil,
             align: :left, max_lines: nil, fit: true, opacity: 1.0, transform: nil, spacing: 0)
      str = str.to_s.strip
      return [ 0, 0 ] if str.empty?

      spec = style_spec(style, size: size, weight: weight, font_role: font_role, transform: transform)
      str = str.upcase if spec[:transform] == "uppercase"

      rendered = render_fitting(str, spec, width, align, max_lines, fit, spacing)
      layer = colorize(rendered, color, opacity)
      offset = case align
      when :centre, :center then (width - rendered.width) / 2
      when :right then width - rendered.width
      else 0
      end
      composite(layer, x + offset, y)
      [ rendered.width, rendered.height ]
    end

    def measure(str, width:, style: nil, size: nil, weight: nil, font_role: nil, max_lines: nil, fit: true, transform: nil, spacing: 0)
      str = str.to_s.strip
      return [ 0, 0 ] if str.empty?

      spec = style_spec(style, size: size, weight: weight, font_role: font_role, transform: transform)
      str = str.upcase if spec[:transform] == "uppercase"
      rendered = render_fitting(str, spec, width, :left, max_lines, fit, spacing)
      [ rendered.width, rendered.height ]
    end

    # Altura de uma linha no estilo — para reservar espaço antes de desenhar.
    def line_height(style: nil, size: nil, font_role: nil, weight: nil)
      spec = style_spec(style, size: size, weight: weight, font_role: font_role, transform: nil)
      (spec[:size] * LINE_HEIGHT).round
    end

    def style_size(style)
      style_spec(style)[:size]
    end

    # ------------------------------------------------------------- imagem

    # Encaixa um ativo numa caixa: `:contain` (inteiro, centrado) ou `:cover`
    # (preenche, cortando pelo centro).
    def image(source, x:, y:, width:, height:, fit: :contain)
      return false unless source

      picture = prepare(source)
      picture = if fit == :cover
        picture.thumbnail_image(width, height: height, crop: :centre)
      else
        picture.thumbnail_image(width, height: height, size: :both)
      end
      picture = picture.bandjoin(255) unless picture.has_alpha?
      composite(picture.cast(:uchar), x + (width - picture.width) / 2, y + (height - picture.height) / 2)
      true
    rescue Vips::Error => e
      Rails.logger.warn("engines: imagem não entrou na peça (#{e.message[0, 120]})")
      false
    end

    # ---------------------------------------------------------------- saída

    def to_png
      @image.write_to_buffer(".png")
    end

    def to_vips
      @image
    end

    private

    def style_spec(style, size: nil, weight: nil, font_role: nil, transform: nil)
      base = style ? tokens.style(style) : nil
      role = font_role || base&.fetch("font") || "utility"
      font = tokens.font(role)
      {
        family: font.family || "sans-serif",
        fontfile: font.fontfile,
        size: (size || ((base&.fetch("size") || 18) * SCALE)).round,
        weight: weight || base&.fetch("weight") || 400,
        transform: transform || base&.fetch("transform")
      }
    end

    def font_description(spec, size)
      [ spec[:family], PANGO_WEIGHTS.fetch(spec[:weight].to_i, ""), "#{size}px" ].reject(&:blank?).join(" ")
    end

    # Renderiza a máscara do texto, encolhendo até respeitar `max_lines` e a
    # largura (uma palavra maior que a coluna também conta como estouro).
    def render_fitting(str, spec, width, align, max_lines, fit, spacing)
      size = spec[:size]
      floor = (size * MIN_SHRINK).round
      loop do
        rendered = render_mask(str, spec, size, width, align, spacing)
        line = (size * LINE_HEIGHT)
        lines = (rendered.height / line).ceil
        fits = rendered.width <= width && (max_lines.nil? || lines <= max_lines)
        return rendered if fits || !fit || size <= floor

        size = [ (size * 0.92).floor, floor ].max
      end
    end

    def render_mask(str, spec, size, width, align, spacing)
      options = {
        font: font_description(spec, size),
        width: width,
        align: { left: :low, center: :centre, centre: :centre, right: :high }.fetch(align, :low),
        wrap: :word,
        spacing: spacing,
        rgba: false
      }
      options[:fontfile] = spec[:fontfile] if spec[:fontfile]
      Vips::Image.text(ERB::Util.html_escape(str), **options)
    end

    # Camada nova nasce "multiband" e o `composite` recusa converter isso
    # para sRGB — daí o `copy(interpretation:)` em tudo que é criado do zero.
    def solid(w, h, hex)
      Vips::Image.black(w, h, bands: 3).new_from_image(rgb(hex)).bandjoin(255).cast(:uchar).copy(interpretation: :srgb)
    end

    def flat_mask(w, h)
      Vips::Image.black(w, h).new_from_image(255).cast(:uchar)
    end

    def rounded_mask(w, h, r)
      mask = Vips::Image.black(w, h)
      mask = mask.draw_rect(255, r, 0, w - 2 * r, h, fill: true) if w > 2 * r
      mask = mask.draw_rect(255, 0, r, w, h - 2 * r, fill: true) if h > 2 * r
      [ [ r, r ], [ w - r - 1, r ], [ r, h - r - 1 ], [ w - r - 1, h - r - 1 ] ].each do |cx, cy|
        mask = mask.draw_circle(255, cx, cy, r, fill: true)
      end
      mask
    end

    # Máscara (1 banda) + cor → camada RGBA pronta para compor.
    def colorize(mask, hex, opacity)
      mask = (mask * opacity).cast(:uchar) if opacity < 1.0
      mask.new_from_image(rgb(hex)).bandjoin(mask).cast(:uchar).copy(interpretation: :srgb)
    end

    def composite(layer, x, y)
      @image = @image.composite2(layer, :over, x: x.round, y: y.round)
    end

    # PNG/JPEG/WebP chegam como sRGB (ou multiband, que o libvips trata
    # igual); cinza, CMYK e 16 bits são convertidos para compor.
    def prepare(source)
      picture = source.is_a?(Vips::Image) ? source : Vips::Image.new_from_buffer(source, "")
      return picture if picture.interpretation == :srgb
      return picture.copy(interpretation: :srgb) if picture.interpretation == :multiband

      picture.colourspace(:srgb)
    rescue Vips::Error
      picture
    end

    def rgb(hex)
      hex = hex.to_s.delete("#")
      hex = hex.chars.map { |c| c * 2 }.join if hex.length == 3
      [ hex[0, 2], hex[2, 2], hex[4, 2] ].map { |pair| pair.to_i(16) }
    end
  end
end
