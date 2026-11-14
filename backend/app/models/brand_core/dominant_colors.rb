require "vips"

# As cores que já estão na logo da pessoa.
#
# Quem sobe uma logo já escolheu as cores da marca — perguntar de novo seria
# fazer a pessoa repetir uma decisão que ela já tomou. Isto lê a imagem e
# devolve as cores que mandam nela, para a etapa de cores começar com elas
# (ou para a IA propor a paleta em cima delas, e não do nada).
#
# Deliberadamente simples: reduz a imagem, joga fora pixel transparente e
# pixel sem cor (o preto e o branco de qualquer logo), agrupa o resto em
# baldes grosseiros e devolve os maiores. Não é k-means e não precisa ser —
# o que interessa é "esta logo é roxa e amarela", não a média exata.
module BrandCore::DominantColors
  # Trabalhar em 96×96 basta e mantém a conta em milissegundos.
  SAMPLE = 96
  # Abaixo disto o pixel é fundo, não desenho.
  MIN_ALPHA = 128
  # Cinza, preto e branco não são "a cor da marca".
  MIN_CHROMA = 0.14
  # Baldes de 32 níveis por canal: junta tons vizinhos sem fundir cores
  # diferentes.
  BUCKET = 32
  # Uma cor que aparece em menos de 1,5% dos pixels úteis é respingo.
  MIN_SHARE = 0.015

  module_function

  # Devolve até `limit` hexes, do mais presente para o menos.
  def call(blob, limit: 3)
    image = load(blob)
    return [] unless image

    pixels = sample(image)
    return [] if pixels.empty?

    buckets = Hash.new(0)
    pixels.each { |r, g, b| buckets[key(r, g, b)] += 1 }

    total = pixels.length
    buckets
      .select { |_, count| count.fdiv(total) >= MIN_SHARE }
      .sort_by { |_, count| -count }
      .map { |bucket, _| hex_from(bucket) }
      .then { |list| distinct(list, limit) }
  rescue StandardError => e
    # Logo estranha não pode derrubar o onboarding: a etapa de cores segue
    # sem sugestão, que é o mesmo que ela faria sem logo nenhuma.
    Rails.logger.warn("dominant_colors: #{e.class}: #{e.message[0, 120]}")
    []
  end

  def load(blob)
    image = Vips::Image.new_from_buffer(blob, "")
    image = image.colourspace(:srgb) unless image.interpretation == :srgb
    image = image.bandjoin(255) unless image.has_alpha?
    image.thumbnail_image(SAMPLE, height: SAMPLE, size: :both)
  rescue Vips::Error
    nil
  end

  # Lê os pixels de uma vez (`write_to_memory`) em vez de pixel a pixel:
  # 96×96 são 9.216 leituras, e cada `getpoint` do libvips é uma operação.
  def sample(image)
    bytes = image.write_to_memory.b
    bands = image.bands
    pixels = []
    index = 0
    while index + bands <= bytes.bytesize
      r = bytes.getbyte(index)
      g = bytes.getbyte(index + 1)
      b = bytes.getbyte(index + 2)
      alpha = bands >= 4 ? bytes.getbyte(index + 3) : 255
      index += bands
      next if alpha < MIN_ALPHA
      next if ([ r, g, b ].max - [ r, g, b ].min) / 255.0 < MIN_CHROMA

      pixels << [ r, g, b ]
    end
    pixels
  end

  def key(r, g, b)
    [ r / BUCKET, g / BUCKET, b / BUCKET ]
  end

  # O centro do balde, e não o primeiro pixel dele: evita devolver um tom que
  # só existe numa borda serrilhada.
  def hex_from(bucket)
    BrandCore::Colors.hex(*bucket.map { |v| v * BUCKET + BUCKET / 2 })
  end

  # Duas cores quase iguais são uma cor só na cabeça de quem olha.
  def distinct(list, limit)
    list.each_with_object([]) { |hex, kept|
      next if kept.length >= limit
      next if kept.any? { |chosen| close?(chosen, hex) }

      kept << hex
    }
  end

  def close?(a, b)
    BrandCore::Colors.rgb(a).zip(BrandCore::Colors.rgb(b)).sum { |x, y| (x - y).abs } < 60
  end
end
