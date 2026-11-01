require "open3"
require "vips"

module Logos
  # O símbolo que o gerador desenhou, em vetor: recorta no desenho, passa pelo
  # vtracer (binário fixo na imagem de produção) e tira o fundo branco — o
  # branco vira transparência. No teste com a padaria, o vtracer ficou a menos
  # de 1% de diferença do original, contra 4–8% do Claude escrevendo o SVG.
  #
  # Devolve o SVG limpo; os PNGs saem dele (`Lockup.raster`), para que o que
  # a pessoa vê seja o que entra na marca.
  class Vectorize
    class Failed < StandardError; end

    Result = Struct.new(:svg, keyword_init: true)

    # O lado maior que o vtracer recebe: o bastante para a curva sair fiel.
    TRACE_PX = 1024
    # Quanto o canal mais escuro precisa estar abaixo do branco para ser
    # desenho, não fundo.
    WHITE = 235
    # Ladrilho atrás do símbolo (o gerador às vezes desenha "ícone de app"):
    # a borda do desenho quase toda de uma cor só, que não é branco. Essa cor
    # vira fundo — senão a variante escura, numa cor só, sai um bloco.
    TILE_SHARE = 0.9
    TILE_CLOSE = 30
    TILE_KEY = 70
    TIMEOUT = 60
    # `cutout`: cada região é uma forma só dela, sem sobreposição. No `stacked`
    # a maior região vira a camada de baixo, inteira — num símbolo que ocupa
    # mais que o branco em volta, tirar o branco deixava um quadrado da cor
    # do símbolo.
    OPTIONS = %w[
      --colormode color --hierarchical cutout --mode spline --filter_speckle 8 --color_precision 5
      --gradient_step 24 --corner_threshold 60 --segment_length 4 --splice_threshold 45 --path_precision 2
    ].freeze

    def self.bin = ENV.fetch("VTRACER_PATH", "vtracer")

    def self.available?
      return @available unless @available.nil?

      @available = system(bin, "--version", out: File::NULL, err: File::NULL) || false
    rescue SystemCallError
      @available = false
    end

    def call(data)
      Dir.mktmpdir("vekoo-logo") do |dir|
        input = File.join(dir, "symbol.png")
        output = File.join(dir, "symbol.svg")
        prepare(data).write_to_file(input)
        trace(input, output)
        Result.new(svg: clean(File.read(output)))
      end
    end

    private

    # Sobre branco, recortado no desenho, com uma margem e no tamanho do trace.
    def prepare(data)
      image = Vips::Image.new_from_buffer(data, "")
      image = image.colourspace("srgb") unless image.interpretation == :srgb
      image = image.flatten(background: [ 255, 255, 255 ]) if image.has_alpha?
      image = image.extract_band(0, n: 3) if image.bands > 3
      left, top, width, height = image.find_trim(threshold: 255 - WHITE, background: [ 255, 255, 255 ])
      raise Failed, "imagem sem desenho" if width < 8 || height < 8

      image = image.crop(left, top, width, height)
      image = untile(image)
      left, top, width, height = image.find_trim(threshold: 255 - WHITE, background: [ 255, 255, 255 ])
      raise Failed, "imagem sem desenho" if width < 8 || height < 8

      image = image.crop(left, top, width, height)
      margin = ([ width, height ].max * 0.04).round
      image = image.embed(margin, margin, width + (2 * margin), height + (2 * margin), extend: :background, background: [ 255, 255, 255 ])
      image.resize(TRACE_PX.to_f / [ image.width, image.height ].max)
    end

    # A cor que domina a borda do desenho recortado, se dominar mesmo e não for
    # branco, sai: os pixels perto dela (com a borda suavizada) viram branco.
    def untile(image)
      ring = border(image)
      median = (0..2).map { |band| ring.map { |pixel| pixel[band] }.sort[ring.size / 2] }
      return image if median.all? { |channel| channel >= WHITE }

      close = ring.count { |pixel| distance(pixel, median) <= TILE_CLOSE }
      return image if close < ring.size * TILE_SHARE

      far = (image - median).abs.bandmean > (TILE_KEY / 3.0)
      far.ifthenelse(image, [ 255, 255, 255 ]).cast(:uchar)
    end

    # Os pixels das quatro bordas, um a cada poucos (rápido e suficiente).
    def border(image)
      step = [ [ image.width, image.height ].max / 200, 1 ].max
      edges = []
      (0...image.width).step(step) { |x| edges << image.getpoint(x, 0) << image.getpoint(x, image.height - 1) }
      (0...image.height).step(step) { |y| edges << image.getpoint(0, y) << image.getpoint(image.width - 1, y) }
      edges
    end

    def distance(pixel, color) = pixel.zip(color).sum { |a, b| (a - b).abs }

    def trace(input, output)
      _out, err, status = Timeout.timeout(TIMEOUT) { Open3.capture3(self.class.bin, "--input", input, "--output", output, *OPTIONS) }
      raise Failed, "vtracer: #{err.to_s.first(160)}" unless status.success? && File.size?(output)
    rescue Timeout::Error
      raise Failed, "vtracer passou de #{TIMEOUT} s"
    end

    # O fundo sai: caminho de cor quase branca é o papel, não o desenho.
    def clean(svg)
      width = svg[/<svg[^>]*\swidth="(\d+(?:\.\d+)?)"/, 1]
      height = svg[/<svg[^>]*\sheight="(\d+(?:\.\d+)?)"/, 1]
      raise Failed, "SVG sem medidas" unless width && height

      paths = svg.scan(/<path\b[^>]*\/>/).reject { |path| white?(path[/fill="#([0-9A-Fa-f]{6})"/, 1]) }
      raise Failed, "SVG sem desenho" if paths.empty?

      %(<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 #{width} #{height}" width="#{width}" height="#{height}">\n#{paths.join("\n")}\n</svg>\n)
    end

    def white?(hex)
      return true if hex.nil?

      hex.scan(/../).all? { |pair| pair.to_i(16) >= WHITE }
    end
  end
end
