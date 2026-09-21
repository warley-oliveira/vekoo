require "rails_helper"

# A paleta derivada de duas ou três cores. A regra que manda é o contraste:
# uma paleta bonita que deixa texto ilegível na peça é pior do que uma sem
# graça.
RSpec.describe BrandCore::PaletteBuilder do
  def build(*hexes)
    described_class.call(hexes, label: ->(role) { role }).index_by { |color| color["role"] }
  end

  def contrast(palette, ink, background)
    BrandCore::Colors.contrast(palette[ink]["hex"], palette[background]["hex"])
  end

  # A propriedade que importa mais que qualquer exemplo: qualquer entrada
  # plausível sai legível.
  [
    [ "#7c3aed" ], [ "#e63946", "#f1faee" ], [ "#2b1d3a", "#7c3aed", "#f4ecff" ],
    [ "#1d3557", "#457b9d", "#a8dadc" ], [ "#000000" ], [ "#ffffff" ],
    [ "#888888" ], [ "#f2b134", "#8c2f1e" ], [ "#00ff00", "#ff00ff" ]
  ].each do |input|
    it "garante contraste de leitura para #{input.join(' + ')}" do
      palette = build(*input)

      expect(contrast(palette, "textOnDark", "darkBackground")).to be >= described_class::MIN_CONTRAST
      expect(contrast(palette, "textOnLight", "lightBackground")).to be >= described_class::MIN_CONTRAST
      # O apoio é mais fraco de propósito, mas ainda tem que dar para ler.
      expect(contrast(palette, "muted", "lightBackground")).to be >= 3.0
    end
  end

  it "sempre entrega os papéis que a geração precisa" do
    palette = build("#7c3aed")

    expect(palette.keys).to include(*BrandCore::Schema::BACKGROUND_ROLES.keys)
    expect(palette.keys).to include("textOnDark", "textOnLight", "accent", "muted")
    expect(BrandCore::Schema.palette_rules("colors" => palette.values).values).to all(be(true))
  end

  it "usa a cor mais colorida como destaque, não a mais escura" do
    palette = build("#1f1b18", "#c96a3f")

    expect(palette["accent"]["hex"]).to eq("#c96a3f")
  end

  it "aproveita a cor escura que a pessoa deu, em vez de inventar um preto" do
    palette = build("#2b1d3a", "#7c3aed")

    expect(palette["darkBackground"]["hex"]).to eq("#2b1d3a")
  end

  it "escurece a cor da marca quando não há fundo escuro — a matiz continua sendo dela" do
    palette = build("#7c3aed")

    expect(palette["darkBackground"]["hex"]).not_to eq("#000000")
    # Roxo escuro: o azul continua acima do verde, como no roxo original.
    r, g, b = BrandCore::Colors.rgb(palette["darkBackground"]["hex"])
    expect(b).to be > g
    expect(BrandCore::Colors.luminance(palette["darkBackground"]["hex"])).to be < 0.12
  end

  it "não repete o mesmo hex em dois papéis" do
    palette = build("#1d3557", "#457b9d", "#a8dadc")

    hexes = palette.values.map { |c| c["hex"] }
    expect(hexes.uniq.length).to eq(hexes.length)
  end

  it "só cria a cor de campanha quando sobra uma segunda cor de verdade" do
    expect(build("#7c3aed")).not_to have_key("campaign")
    expect(build("#1d3557", "#457b9d", "#a8dadc")).to have_key("campaign")
  end

  it "reaproveita o nome que a pessoa deu e batiza o resto pelo papel" do
    palette = described_class.call(
      [ { "hex" => "#7c3aed", "name" => "Ameixa" } ],
      label: ->(role) { "papel:#{role}" }
    ).index_by { |color| color["role"] }

    expect(palette["accent"]["name"]).to eq("Ameixa")
    expect(palette["muted"]["name"]).to eq("papel:muted")
  end

  it "ignora entrada inválida em vez de estourar" do
    expect(described_class.call([ "não é cor", "", nil ])).to be_empty
    expect(described_class.call(nil)).to be_empty
  end

  it "aceita hex de três dígitos, como todo campo de cor da web" do
    palette = described_class.call([ "#f0a" ], label: ->(r) { r }).index_by { |c| c["role"] }

    expect(palette["accent"]["hex"]).to eq("#ff00aa")
  end
end

# As cores que já estão na logo da pessoa: quem subiu um arquivo já escolheu
# a paleta, e perguntar de novo seria fazê-la repetir a decisão.
RSpec.describe BrandCore::DominantColors do
  it "acha a cor que manda numa logo colorida" do
    blob = File.binread(Rails.root.join("spec/fixtures/files/logo-transparente.png"))

    colors = described_class.call(blob)

    expect(colors).to all(match(BrandCore::Schema::HEX))
    expect(colors).not_to be_empty
  end

  it "ignora imagem que não decodifica, em vez de derrubar a etapa de cores" do
    expect(described_class.call("isto não é uma imagem")).to eq([])
  end

  it "respeita o teto pedido" do
    blob = File.binread(Rails.root.join("spec/fixtures/files/foto.png"))

    expect(described_class.call(blob, limit: 2).length).to be <= 2
  end
end

# O logotipo tipográfico: o nome do negócio na fonte escolhida, sem IA.
RSpec.describe RenderWordmark do
  let(:brand) { create(:brand_core, :complete) }

  it "desenha as duas versões, em PNG com fundo transparente" do
    results = described_class.call(brand)

    expect(results.map(&:variant)).to match_array(%w[light dark])
    results.each do |result|
      expect(result.png[0, 8].b).to eq("\x89PNG\r\n\x1a\n".b)
      expect(PngInspector.call(StringIO.new(result.png)).transparent).to be(true)
    end
  end

  it "é determinístico: mesma marca, mesmo arquivo" do
    expect(described_class.call(brand).first.png).to eq(described_class.call(brand).first.png)
  end

  it "usa as cores da marca — a versão para fundo escuro é clara, e vice-versa" do
    light, dark = described_class.call(brand).partition { |r| r.variant == "light" }.map(&:first)

    # Versões diferentes têm arquivos diferentes: a tinta não é a mesma.
    expect(light.png).not_to eq(dark.png)
  end

  it "não desenha marca sem nome" do
    expect(described_class.call(create(:brand_core)).length).to eq(0)
  end

  it "guarda como ativo da marca, marcado como desenhado pela Vekoo" do
    assets = described_class.attach!(brand)

    expect(assets.length).to eq(2)
    expect(assets).to all(be_generated)
    expect(brand.reload.logo?).to be(true)
  end

  it "refaz sem acumular, e nunca toca num arquivo que a pessoa enviou" do
    uploaded = create(:brand_asset, brand_core: brand, variant: "light")
    described_class.attach!(brand)
    described_class.attach!(brand)

    expect(brand.reload.assets.where(kind: "logo", generated: true).count).to eq(2)
    expect(BrandAsset.exists?(uploaded.id)).to be(true)
  end
end
