require "rails_helper"

# O ritmo do carrossel: a cor de cada lâmina vem do esquema da marca, não do
# agente; o miolo tem um fundo só, um destaque no máximo e um tamanho de letra
# só. O medidor de texto é um dublê — a altura cresce com o texto e o tamanho.
RSpec.describe "Ritmo do carrossel" do
  let(:brand) { create(:brand_core, :published) }
  let(:colors) { Engines::Tokens.new(brand).colors }

  # Altura = linhas × tamanho; uma linha a cada 30 caracteres no tamanho 80.
  let(:measurer) do
    Class.new {
      def text_height(text, _role, size, _width, max_lines)
        lines = (text.length * size / 2_400.0).ceil
        [ lines * size * 1.2, max_lines && lines > max_lines ]
      end
    }.new
  end

  def slide(layout, title: "Uma ideia curta", body: nil, **extra)
    { "layout" => layout, "background" => { "colorToken" => "secondary" }, "content" => { "title" => title, "body" => body }.compact, **extra }
  end

  def carousel(*middle, scheme: nil)
    {
      "format" => "carousel", "scheme" => scheme,
      "slides" => [ slide("carousel-cover", title: "Capa"), *middle, slide("carousel-last-cta", title: "Chama no direct") ],
      "caption" => { "text" => "Legenda", "hashtags" => [] }
    }.compact
  end

  def build(raw) = PieceDocument::Build.from_agent(raw, brand_core: brand, measurer: measurer)
  def tokens(document) = document["slides"].map { |s| s.dig("background", "colorToken") }

  describe PieceDocument::Rhythm do
    it "tira os dois esquemas da paleta, com o papel de cada cor" do
      schemes = described_class.schemes(colors)

      expect(schemes["light"]).to eq("cover" => "primary", "body" => "surface", "highlight" => "accent", "cta" => "primary")
      expect(schemes["dark"]).to eq("cover" => "accent", "body" => "primary", "highlight" => "accent", "cta" => "accent")
    end

    it "sem fundo claro na paleta não há esquema claro; sem acento, o destaque cai no que a marca tem" do
      dark_only = colors.reject { |c| %w[lightBackground accent].include?(c["role"]) }

      schemes = described_class.schemes(dark_only)

      expect(schemes.keys).to eq(%w[dark])
      expect(described_class.scheme_for("light", dark_only).first).to eq("dark")
      expect(schemes["dark"]["highlight"]).to eq("primary")
    end
  end

  describe "no Build" do
    it "ignora o fundo do agente: capa e chamada no escuro, miolo claro, um destaque no acento" do
      document = build(carousel(slide("carousel-body"), slide("carousel-body", highlight: true), slide("carousel-body", highlight: true)))

      expect(tokens(document)).to eq(%w[primary surface accent surface primary])
      expect(document.dig("meta", "scheme")).to eq("light")
    end

    it "esquema escuro inverte o miolo; esquema desconhecido vira o padrão" do
      expect(tokens(build(carousel(slide("carousel-body"), scheme: "dark")))).to eq(%w[accent primary accent])
      expect(build(carousel(slide("carousel-body"), scheme: "neon")).dig("meta", "scheme")).to eq("light")
    end

    it "destaque na capa não conta: só o miolo tem destaque" do
      raw = carousel(slide("carousel-body"))
      raw["slides"][0]["highlight"] = true

      expect(tokens(build(raw))).to eq(%w[primary surface primary])
    end

    it "fora do carrossel, o fundo continua sendo do agente" do
      raw = { "format" => "feed_portrait", "slides" => [ slide("text-only-solid") ] }

      expect(tokens(build(raw))).to eq(%w[secondary])
    end
  end

  describe PieceDocument::Fit do
    def steps(document)
      document["slides"].filter_map { |s| s["blocks"].select { |b| b["type"] == "text" }.map { |b| b["sizeStep"] } if s["layoutId"] == "carousel-body" }
    end

    it "texto curto cresce dois degraus, igual em todas as lâminas do miolo" do
      document = build(carousel(slide("carousel-body", body: "Pouco texto."), slide("carousel-body", body: "Também pouco.")))

      expect(steps(document)).to eq([ [ 2, 2 ], [ 2, 2 ] ])
    end

    it "a lâmina que mais ocupa decide o degrau de todas" do
      title = "Um título comprido que ocupa três linhas inteiras na lâmina"
      body = "Uma frase comprida que ocupa bastante espaço na lâmina. " * 3 + "E mais um pouco."
      document = build(carousel(slide("carousel-body", body: "Curto."), slide("carousel-body", title: title, body: body)))

      expect(steps(document)).to eq([ [ 1, 1 ], [ 1, 1 ] ])
    end

    it "sem conseguir medir, fica no tamanho do layout" do
      broken = Object.new
      def broken.text_height(*) = raise(Vips::Error, "sem fonte")

      document = PieceDocument::Build.from_agent(carousel(slide("carousel-body")), brand_core: brand, measurer: broken)

      expect(steps(document)).to eq([ [ 0 ] ])
    end
  end

  describe PieceDocument::Compact do
    it "devolve o esquema e o destaque, sem fundo por lâmina" do
      document = build(carousel(slide("carousel-body"), slide("carousel-body", highlight: true), slide("carousel-body"), scheme: "dark"))

      compact = described_class.call(document)

      expect(compact["scheme"]).to eq("dark")
      expect(compact["slides"].map { |s| s["background"] }.compact).to be_empty
      expect(compact["slides"].map { |s| s["highlight"] }).to eq([ nil, nil, true, nil, nil ])
    end
  end

  describe "no plano do agente" do
    before { allow(PieceRenderers::Libvips).to receive(:new).and_return(measurer) }

    def plan(variation) = Agent::Plan.call(JSON.generate("question" => nil, "variations" => [ variation ]), brand_core: brand)

    it "miolo fora da família sem motivo volta como erro para a segunda tentativa" do
      result = plan(carousel(slide("carousel-body"), slide("text-only-solid", body: nil)))

      expect(result.variations).to be_empty
      expect(result.errors.join).to include("lâmina 3").and include("carousel-body")
    end

    it "dois destaques voltam como erro" do
      result = plan(carousel(slide("carousel-body", highlight: true), slide("carousel-body", highlight: true)))

      expect(result.errors.join).to include("no máximo uma")
    end

    it "layout só de texto vale na lâmina de destaque" do
      result = plan(carousel(slide("carousel-body"), slide("text-only-solid", highlight: true)))

      expect(result.errors).to be_empty
      expect(tokens(result.variations.first.document)).to eq(%w[primary surface accent primary])
    end
  end

  it "a ficha da marca diz o que cada esquema pinta" do
    rhythm = Agent::BrandBrief.new(Engines::Tokens.new(brand)).as_json["ritmoDoCarrossel"]

    expect(rhythm["light"]).to eq("capa" => "Casca", "miolo" => "Farinha", "destaque" => "Manteiga", "chamadaFinal" => "Casca")
  end
end
