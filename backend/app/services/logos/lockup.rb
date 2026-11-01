require "vips"

module Logos
  # A logo montada: o símbolo vetorizado e o nome da marca na fonte dela, em
  # dois arranjos — o símbolo ao lado do nome e o símbolo em cima do nome. O
  # nome é o do logotipo tipográfico (`RenderWordmark`), então sai escrito
  # certo e na tipografia da marca, nunca a letra que o gerador inventou.
  #
  # Cada arranjo sai em duas variantes, como toda logo da marca: a clara (o
  # símbolo nas cores dele, o nome na cor de texto sobre fundo claro) e a
  # escura (o nome na cor de texto sobre fundo escuro; no símbolo, só as cores
  # que sumiriam no fundo escuro trocam para essa cor — o acento fica, e o
  # desenho de dentro não vira um borrão).
  class Lockup
    ARRANGEMENTS = %w[horizontal stacked].freeze
    # O símbolo, em px, antes de a logo inteira caber na largura final.
    SYMBOL = 640
    TARGET_WIDTH = 2048
    PADDING = 48

    # Contraste mínimo de uma cor do símbolo contra o fundo escuro da marca
    # para ela ficar como está na variante escura.
    DARK_CONTRAST = 2.2

    # O símbolo em PNG, tirado do próprio vetor, recortado no desenho.
    def self.raster(svg, height)
      image = Vips::Image.svgload_buffer(svg)
      image = image.resize(height.to_f / image.height)
      left, top, width, height = image.extract_band(3).find_trim(threshold: 8, background: [ 0 ])
      width.positive? && height.positive? ? image.crop(left, top, width, height) : image
    end

    # O símbolo para fundo escuro: a cor que não aparece nele vira a de texto
    # sobre fundo escuro.
    def self.dark_svg(svg, brand_core)
      background = color(brand_core, "darkBackground", "#12101a")
      ink = color(brand_core, "textOnDark", "#faf8f5")
      svg.gsub(/fill="(#[0-9A-Fa-f]{6})"/) { contrast(Regexp.last_match(1), background) < DARK_CONTRAST ? %(fill="#{ink}") : Regexp.last_match(0) }
    end

    def self.color(brand_core, role, fallback)
      colors = BrandCore::Schema.complete(brand_core.document).dig("palette", "colors").to_a
      colors.find { |c| c["role"] == role && c["hex"].to_s.match?(BrandCore::Schema::HEX) }&.fetch("hex") || fallback
    end

    def self.contrast(a, b)
      high, low = [ luminance(a), luminance(b) ].minmax.reverse
      (high + 0.05) / (low + 0.05)
    end

    def self.luminance(hex)
      r, g, b = hex.delete("#").scan(/../).map { |pair|
        channel = pair.to_i(16) / 255.0
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055)**2.4
      }
      (0.2126 * r) + (0.7152 * g) + (0.0722 * b)
    end

    def initialize(brand_core, symbol_svg)
      @brand = brand_core
      @light = self.class.raster(symbol_svg, SYMBOL)
      @dark = self.class.raster(self.class.dark_svg(symbol_svg, brand_core), SYMBOL)
    end

    # { "horizontal" => { "light" => png, "dark" => png }, "stacked" => {…} }.
    # Sem nome desenhável (marca sem nome), nada.
    def call
      names = RenderWordmark.call(@brand).to_h { |result| [ result.variant, trim(Vips::Image.new_from_buffer(result.png, "")) ] }
      return {} unless names["light"] && names["dark"]

      ARRANGEMENTS.to_h { |arrangement|
        [ arrangement, {
          "light" => compose(arrangement, @light, names["light"]),
          "dark" => compose(arrangement, @dark, names["dark"])
        } ]
      }
    end

    private

    def compose(arrangement, symbol, name)
      arrangement == "horizontal" ? horizontal(symbol, name) : stacked(symbol, name)
    end

    # O nome na altura de ~40% do símbolo, centrado na vertical.
    def horizontal(symbol, name)
      name = name.resize((symbol.height * 0.4) / name.height)
      gap = (symbol.height * 0.28).round
      width = symbol.width + gap + name.width
      height = [ symbol.height, name.height ].max
      canvas = blank(width, height)
      canvas = canvas.composite2(symbol, :over, x: 0, y: (height - symbol.height) / 2)
      canvas = canvas.composite2(name, :over, x: symbol.width + gap, y: (height - name.height) / 2)
      finish(canvas)
    end

    # O nome embaixo, centrado; nome comprido encolhe até ~2,6× o símbolo.
    def stacked(symbol, name)
      name = name.resize((symbol.height * 0.26) / name.height)
      limit = symbol.width * 2.6
      name = name.resize(limit / name.width) if name.width > limit
      gap = (symbol.height * 0.16).round
      width = [ symbol.width, name.width ].max
      height = symbol.height + gap + name.height
      canvas = blank(width, height)
      canvas = canvas.composite2(symbol, :over, x: (width - symbol.width) / 2, y: 0)
      canvas = canvas.composite2(name, :over, x: (width - name.width) / 2, y: symbol.height + gap)
      finish(canvas)
    end

    # Margem transparente e, no máximo, a largura do PNG grande da marca.
    def finish(canvas)
      canvas = canvas.embed(PADDING, PADDING, canvas.width + (2 * PADDING), canvas.height + (2 * PADDING),
        extend: :background, background: [ 0, 0, 0, 0 ])
      canvas = canvas.resize(TARGET_WIDTH.to_f / canvas.width) if canvas.width > TARGET_WIDTH
      canvas.cast(:uchar).copy(interpretation: :srgb).write_to_buffer(".png")
    end

    def blank(width, height)
      Vips::Image.black(width.round, height.round, bands: 4).copy(interpretation: :srgb)
    end

    def trim(image)
      image = image.bandjoin(255) unless image.has_alpha?
      left, top, width, height = image.extract_band(3).find_trim(threshold: 8, background: [ 0 ])
      width.positive? && height.positive? ? image.crop(left, top, width, height) : image
    end
  end
end
