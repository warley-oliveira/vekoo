# O catálogo aberto de fontes, do lado do servidor.
#
# Espelho de `frontend/src/lib/font-catalog.ts` — mudou um, muda o outro; a
# spec `spec/models/font_catalog_spec.rb` compara as duas listas e falha se
# saírem de sincronia. Existe aqui por dois motivos: é dele que o agente
# escolhe os pares sugeridos no onboarding (e o que ele responde é validado
# contra esta lista), e é dele que `BrandFonts` sabe quais famílias baixar
# para a peça sair com a fonte certa.
module BrandCore::FontCatalog
  CATEGORIES = %w[sans serif display mono].freeze

  Font = Struct.new(:family, :category, :weights, keyword_init: true)

  def self.range(from, to)
    (from..to).step(100).to_a
  end

  FONTS = [
    Font.new(family: "Inter", category: "sans", weights: range(100, 900)),
    Font.new(family: "Geist", category: "sans", weights: range(100, 900)),
    Font.new(family: "DM Sans", category: "sans", weights: range(100, 900)),
    Font.new(family: "Manrope", category: "sans", weights: range(200, 800)),
    Font.new(family: "Plus Jakarta Sans", category: "sans", weights: range(200, 800)),
    Font.new(family: "Work Sans", category: "sans", weights: range(100, 900)),
    Font.new(family: "Nunito", category: "sans", weights: range(200, 900)),
    Font.new(family: "Poppins", category: "sans", weights: range(100, 900)),
    Font.new(family: "Montserrat", category: "sans", weights: range(100, 900)),
    Font.new(family: "Raleway", category: "sans", weights: range(100, 900)),
    Font.new(family: "Outfit", category: "sans", weights: range(100, 900)),
    Font.new(family: "Figtree", category: "sans", weights: range(300, 900)),
    Font.new(family: "Sora", category: "sans", weights: range(100, 800)),
    Font.new(family: "Space Grotesk", category: "sans", weights: range(300, 700)),
    Font.new(family: "Bricolage Grotesque", category: "sans", weights: range(200, 800)),
    Font.new(family: "Archivo", category: "sans", weights: range(100, 900)),
    Font.new(family: "Lexend", category: "sans", weights: range(100, 900)),
    Font.new(family: "Rubik", category: "sans", weights: range(300, 900)),
    Font.new(family: "Fraunces", category: "serif", weights: range(100, 900)),
    Font.new(family: "Playfair Display", category: "serif", weights: range(400, 900)),
    Font.new(family: "DM Serif Display", category: "serif", weights: [ 400 ]),
    Font.new(family: "Lora", category: "serif", weights: range(400, 700)),
    Font.new(family: "Merriweather", category: "serif", weights: range(300, 900)),
    Font.new(family: "Libre Baskerville", category: "serif", weights: [ 400, 700 ]),
    Font.new(family: "Cormorant Garamond", category: "serif", weights: range(300, 700)),
    Font.new(family: "EB Garamond", category: "serif", weights: range(400, 800)),
    Font.new(family: "Instrument Serif", category: "serif", weights: [ 400 ]),
    Font.new(family: "Newsreader", category: "serif", weights: range(200, 800)),
    Font.new(family: "Bebas Neue", category: "display", weights: [ 400 ]),
    Font.new(family: "Anton", category: "display", weights: [ 400 ]),
    Font.new(family: "Unbounded", category: "display", weights: range(200, 900)),
    Font.new(family: "Syne", category: "display", weights: range(400, 800)),
    Font.new(family: "Abril Fatface", category: "display", weights: [ 400 ]),
    Font.new(family: "JetBrains Mono", category: "mono", weights: range(100, 800)),
    Font.new(family: "IBM Plex Mono", category: "mono", weights: range(100, 700)),
    Font.new(family: "Space Mono", category: "mono", weights: [ 400, 700 ])
  ].freeze

  BY_FAMILY = FONTS.index_by(&:family).freeze

  module_function

  def find(family)
    BY_FAMILY[family.to_s]
  end

  def exists?(family)
    BY_FAMILY.key?(family.to_s)
  end

  def families
    FONTS.map(&:family)
  end

  # O peso publicado mais próximo do pedido: pedir um peso que a família não
  # tem faz o Google devolver folha vazia e a fonte não baixa.
  def nearest_weight(family, weight)
    font = find(family)
    return weight.to_i unless font

    font.weights.min_by { |w| (w - weight.to_i).abs }
  end

  # A ficha que o agente lê para sugerir pares. Categoria e um punhado de
  # pesos bastam: o que decide é o nome da família, que ele conhece.
  def as_prompt
    FONTS.group_by(&:category).transform_values { |fonts| fonts.map(&:family) }
  end
end
