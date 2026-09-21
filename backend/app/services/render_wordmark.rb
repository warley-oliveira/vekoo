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
  # Alto o bastante para o logo servir em qualquer peça sem serrilhar.
  FONT_SIZE = 220
  PADDING = 24
  VARIANTS = { "light" => "textOnLight", "dark" => "textOnDark" }.freeze
  MAX_CHARS = 40

  Result = Struct.new(:variant, :png, keyword_init: true)

  def self.call(brand_core)
    new(brand_core).call
  end

  # Gera e guarda como ativo da marca, trocando um logotipo anterior nosso.
  # Logo **enviada pela pessoa** nunca é substituída: se ela já tem uma, o
  # onboarding nem oferece isto.
  def self.attach!(brand_core, account: nil)
    results = call(brand_core)
    return [] if results.empty?

    brand_core.assets.where(kind: "logo", generated: true).destroy_all
    results.map { |result| attach_one(brand_core, result, account) }
  end

  def self.attach_one(brand_core, result, account)
    asset = brand_core.assets.new(
      organization: brand_core.organization,
      account: account,
      kind: "logo",
      variant: result.variant,
      filename: "logotipo-#{result.variant}.png",
      content_type: "image/png",
      byte_size: result.png.bytesize,
      generated: true
    )
    asset.file.attach(io: StringIO.new(result.png), filename: asset.filename, content_type: "image/png")
    asset.save!
    AnalyzeBrandAsset.call(asset, StringIO.new(result.png))
    asset
  end

  def initialize(brand_core)
    @brand_core = brand_core
    @document = BrandCore::Schema.complete(brand_core.document)
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

  # O peso do título é o do logotipo: é o mesmo papel visual.
  def weight
    style = @document.dig("styles", "roles").to_a.find { |s| s["key"] == "title" }
    style&.fetch("weight") || 700
  end

  def draw(hex)
    mask = Vips::Image.text(
      ERB::Util.html_escape(name),
      **{ font: font_description, rgba: false }.merge(fontfile ? { fontfile: fontfile } : {})
    )
    return nil if mask.width.zero? || mask.height.zero?

    layer = mask.new_from_image(BrandCore::Colors.rgb(hex)).bandjoin(mask).cast(:uchar).copy(interpretation: :srgb)
    # A margem transparente evita que o traço encoste na borda quando a peça
    # encaixa o logo numa caixa.
    layer.embed(PADDING, PADDING, layer.width + PADDING * 2, layer.height + PADDING * 2,
      extend: :background, background: [ 0, 0, 0, 0 ]).write_to_buffer(".png")
  end

  def font_description
    family = display["family"].presence || "sans-serif"
    weight_name = Engines::Canvas::PANGO_WEIGHTS.fetch(weight.to_i, "")
    [ family, weight_name, "#{FONT_SIZE}px" ].reject(&:blank?).join(" ")
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
