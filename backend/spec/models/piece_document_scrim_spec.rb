require "rails_helper"

# O degradê atrás do texto por lâmina (sem, leve, forte) e o aviso de leitura:
# o renderizador mede o contraste do texto sobre a foto já escurecida.
RSpec.describe "Degradê por lâmina" do
  let(:brand) { create(:brand_core, :published) }
  let(:photos) { PieceFixtures.synthetic_photos(brand) }

  def carousel(photo)
    PieceDocument::Build.from_agent({ "format" => "carousel", "slides" => [
      { "layout" => "carousel-cover", "content" => { "title" => "Pão quente saindo agora", "image" => photo } },
      { "layout" => "carousel-body", "content" => { "title" => "Um", "body" => "Texto" } },
      { "layout" => "carousel-last-cta", "content" => { "title" => "Chama no direct" } }
    ] }, brand_core: brand)
  end

  def legibility(document, index = 0)
    renderer = PieceRenderers::Libvips.new(brand)
    renderer.render_slide(document, document["slides"][index], index, document["slides"].length)
    renderer.legibility
  end

  def with_scrim(document, level)
    document.deep_dup.tap { |doc| doc["slides"][0]["scrim"] = level }
  end

  it "os níveis mudam opacidade e curva do degradê do layout" do
    layer = { "opacity" => 0.8, "curve" => 0.9 }

    expect(Layouts::Geometry.scrim(layer, nil)).to eq(opacity: 0.8, curve: 0.9)
    expect(Layouts::Geometry.scrim(layer, "none")).to be_nil
    expect(Layouts::Geometry.scrim(layer, "light")).to eq(opacity: 0.44, curve: 0.9)
    expect(Layouts::Geometry.scrim(layer, "strong")).to eq(opacity: 0.92, curve: 0.63)
    expect(Layouts::Geometry.scrim({ "opacity" => 0.62 }, "strong")).to eq(opacity: 0.77, curve: 0.98)
  end

  it "texto claro sobre foto clara sem degradê não passa; com o forte, passa" do
    document = carousel(photos[:light])

    without = legibility(with_scrim(document, "none"))
    strong = legibility(with_scrim(document, "strong"))

    expect(without["ok"]).to be(false)
    expect(without["contrast"]).to be < 3
    expect(strong["ok"]).to be(true)
    expect(strong["contrast"]).to be > without["contrast"]
  end

  it "foto escura com o degradê do layout passa; lâmina sem texto sobre foto não mede" do
    document = carousel(photos[:dark])

    expect(legibility(document)["ok"]).to be(true)
    expect(legibility(document, 1)).to be_nil
  end

  describe "set_scrim" do
    def apply(document, operation) = PieceDocument::Operations.apply(document, [ operation ], brand_core: brand)

    it "grava o nível, volta ao do layout e recusa o que não serve" do
      document = carousel(photos[:dark])
      cover = document["slides"][0]["id"]
      body = document["slides"][1]["id"]

      strong = apply(document, { "op" => "set_scrim", "slideId" => cover, "level" => "strong" })
      expect(strong.document["slides"][0]["scrim"]).to eq("strong")

      back = apply(strong.document, { "op" => "set_scrim", "slideId" => cover, "level" => nil })
      expect(back.document["slides"][0]).not_to have_key("scrim")

      expect(apply(document, { "op" => "set_scrim", "slideId" => cover, "level" => "neon" }).rejected.first["reason"]).to eq("invalid")
      expect(apply(document, { "op" => "set_scrim", "slideId" => body, "level" => "light" }).rejected.first["reason"]).to eq("scrimUnsupported")
    end
  end

  it "o documento só guarda nível conhecido, e a lâmina de sempre continua sem a chave" do
    document = carousel(photos[:dark])
    document["slides"][0]["scrim"] = "light"
    document["slides"][1]["scrim"] = "neon"

    normalized = PieceDocument.normalize(document)

    expect(normalized["slides"][0]["scrim"]).to eq("light")
    expect(normalized["slides"][1]).not_to have_key("scrim")
    expect(normalized["slides"][2]).not_to have_key("scrim")
  end
end
