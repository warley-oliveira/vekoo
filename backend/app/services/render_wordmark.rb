require "vips"

# O logotipo tipográfico da marca — o nome do negócio desenhado na fonte que a
# pessoa escolheu, em versão para fundo claro e para fundo escuro.
#
# Existe para quem não tem logo, que é a maioria de quem começa. **Não é
# geração de imagem por IA**: é o mesmo libvips que desenha as peças, com a
# mesma fonte e as mesmas cores do Brandcore. Rodar duas vezes com o mesmo
# documento dá o mesmo arquivo — e é isso que permite regerar o logotipo
# quando a pessoa troca a fonte, sem surpresa.
#
# Sai como PNG com fundo transparente, apertado no traço, exatamente como um
# logo enviado por arquivo — daí ele entrar como `BrandAsset` de tipo `logo` e
# os motores o consumirem sem saber que a Vekoo é que desenhou.
class RenderWordmark
  # O tamanho de medida: o primeiro desenho só serve para saber a largura, e
  # o segundo sai na escala que dá ~2048 px — o PNG grande do download.
  MEASURE_SIZE = 220
  TARGET_WIDTH = 2048
  # Só segura nome de uma ou duas letras: o resto ocupa a largura toda.
  MAX_HEIGHT = 1400
  PADDING = 48
  VARIANTS = { "light" => "textOnLight", "dark" => "textOnDark" }.freeze
  MAX_CHARS = 40

  # Os três tratamentos que o "cria pra mim" propõe. É o mesmo nome na mesma
  # fonte — muda a caixa, o espaço entre letras e o peso. Não é editor de
  # logo: são três desenhos prontos para escolher.
  STYLES = %w[asWritten spacedCaps boldLower].freeze

  Result = Struct.new(:variant, :png, keyword_init: true)

  def self.call(brand_core, style: "asWritten")
    new(brand_core, style: style).call
  end

  # As três opções, cada uma como uma logo nova da marca (claro + escuro).
  # **Nunca apaga** as anteriores: o histórico de logos é da marca.
  def self.options!(brand_core, account: nil, origin: "onboarding")
    STYLES.filter_map { |style| attach!(brand_core, account: account, style: style, origin: origin) }
  end

  # Um desenho, como uma logo nova. Devolve o `logo_id`, ou nil sem nome.
  def self.attach!(brand_core, account: nil, style: "asWritten", origin: "onboarding")
    results = call(brand_core, style: style)
    return nil if results.empty?

    logo_id = SecureRandom.uuid
    meta = { "origin" => origin, "style" => style }
    results.each { |result| attach_one(brand_core, result, account, logo_id, meta) }
    brand_core.assets.reset
    logo_id
  end

  def self.attach_one(brand_core, result, account, logo_id, meta)
    asset = brand_core.assets.new(
      organization: brand_core.organization,
      account: account,
      kind: "logo",
      variant: result.variant,
      filename: "logotipo-#{meta["style"]}-#{result.variant}.png",
      content_type: "image/png",
      byte_size: result.png.bytesize,
      generated: true,
      logo_id: logo_id,
      meta: meta
    )
    asset.file.attach(io: StringIO.new(result.png), filename: asset.filename, content_type: "image/png")
    asset.save!
    AnalyzeBrandAsset.call(asset, StringIO.new(result.png))
    asset
  end

  def initialize(brand_core, style: "asWritten")
    @brand_core = brand_core
    @document = BrandCore::Schema.complete(brand_core.document)
    @style = STYLES.include?(style) ? style : "asWritten"
  end

  def call
    return [] if name.blank?

    VARIANTS.filter_map do |variant, role|
      png = draw(color_for(role))
      png && Result.new(variant: variant, png: png)
    end
  rescue StandardError => e
    Rails.logger.warn("wordmark #{@brand_core.id}: #{e.class}: #{e.message[0, 160]}")
    []
  end

  private

  def name
    @document.dig("identity", "name").to_s.squish.first(MAX_CHARS)
  end

  def styled_name
    case @style
    when "spacedCaps" then name.upcase
    when "boldLower" then name.downcase
    else name
    end
  end

  def display
    @document.dig("typography", "display")
  end

  # A cor do papel, com um neutro de reserva: o logotipo pode ser desenhado
  # antes de a etapa de cores acontecer.
  def color_for(role)
    colors = @document.dig("palette", "colors").to_a
    colors.find { |c| c["role"] == role && c["hex"].to_s.match?(BrandCore::Schema::HEX) }&.fetch("hex") ||
      (role == "textOnDark" ? "#faf8f5" : "#12101a")
  end

  # O peso do título é o do logotipo: é o mesmo papel visual. O "bold" pega o
  # mais pesado que a fonte da marca tem.
  def weight
    title = @document.dig("styles", "roles").to_a.find { |s| s["key"] == "title" }&.fetch("weight") || 700
    return title unless @style == "boldLower"

    [ Array(display["weights"]).map(&:to_i).max.to_i, title ].max
  end

  def draw(hex)
    measured = text_mask(MEASURE_SIZE)
    return nil if measured.width.zero? || measured.height.zero?

    # Escala para ~2048 px de largura, sem passar da altura: nome curto não
    # vira um bloco gigante.
    scale = [ (TARGET_WIDTH - PADDING * 2).fdiv(measured.width), MAX_HEIGHT.fdiv(measured.height) ].min
    mask = text_mask((MEASURE_SIZE * scale).floor)

    # A largura do texto não cresce exatamente na proporção da fonte: o
    # acerto fino é por redução, que não serrilha.
    room = TARGET_WIDTH - PADDING * 2
    mask = mask.resize(room.fdiv(mask.width)) if mask.width > room

    layer = mask.new_from_image(BrandCore::Colors.rgb(hex)).bandjoin(mask).cast(:uchar).copy(interpretation: :srgb)
    # A margem transparente evita que o traço encoste na borda quando a peça
    # encaixa o logo numa caixa. A largura é sempre a do PNG grande (2048):
    # nome curto, limitado pela altura, fica centrado com margem dos lados.
    left = (TARGET_WIDTH - layer.width) / 2
    layer.embed(left, PADDING, TARGET_WIDTH, layer.height + PADDING * 2,
      extend: :background, background: [ 0, 0, 0, 0 ]).write_to_buffer(".png")
  end

  def text_mask(size)
    Vips::Image.text(
      markup(size),
      **{ font: font_description(size), rgba: false }.merge(fontfile ? { fontfile: fontfile } : {})
    )
  end

  # Caixa alta ganha respiro entre as letras (0,14 em), em unidades do Pango
  # (1/1024 de ponto).
  def markup(size)
    escaped = ERB::Util.html_escape(styled_name)
    return escaped unless @style == "spacedCaps"

    %(<span letter_spacing="#{(size * 0.14 * 1024).round}">#{escaped}</span>)
  end

  def font_description(size)
    family = display["family"].presence || "sans-serif"
    weight_name = Engines::Canvas::PANGO_WEIGHTS.fetch(weight.to_i, "")
    [ family, weight_name, "#{size}px" ].reject(&:blank?).join(" ")
  end

  # O arquivo da fonte, para o logotipo sair na tipografia escolhida e não no
  # que o servidor tiver instalado.
  def fontfile
    return @fontfile if defined?(@fontfile)

    @fontfile =
      if display["source"] == "file" && display["assetId"].present?
        asset = @brand_core.assets.find_by(id: display["assetId"], kind: "font")
        asset && write_font(asset)
      elsif display["family"].present?
        BrandFonts.path(display["family"], weight)
      end
  end

  def write_font(asset)
    file = Tempfile.new([ "wordmark-font", File.extname(asset.filename) ])
    file.binmode
    file.write(asset.file.download)
    file.flush
    @font_tempfile = file # vive enquanto o serviço viver
    file.path
  end
end
