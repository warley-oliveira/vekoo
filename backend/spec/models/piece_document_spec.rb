require "rails_helper"

# A forma da peça: normalização (o que entra vira a forma conhecida), a
# validação por caminho e o caminho de ida e volta com o agente.
RSpec.describe PieceDocument do
  let(:brand) { create(:brand_core, :published) }

  def slide(layout, blocks, background: nil)
    { "layoutId" => layout, "blocks" => blocks, "background" => background }.compact
  end

  def document(format, *slides)
    described_class.normalize({ "format" => format, "slides" => slides }, brand_id: brand.id)
  end

  def validate(doc, strict: false) = PieceDocument::Validator.call(doc, brand_core: brand, strict: strict)

  describe "a biblioteca de layouts" do
    it "carrega os nove layouts, cada um com os formatos que declara" do
      expect(Layouts::Registry.ids).to contain_exactly(
        "hero-image-title-bottom", "hero-image-title-top", "split-image-text", "text-only-solid",
        "text-only-accent-quote", "product-card", "carousel-cover", "carousel-body", "carousel-last-cta"
      )
      expect(Layouts::Registry.for_format("story").map(&:id)).not_to include("carousel-body")
      expect(Layouts::Registry.find("carousel-cover").position).to eq("first")
    end

    it "contrato malformado derruba com a razão" do
      expect { Layouts::Contract.new({ "id" => "x", "formats" => [ "outdoor" ] }, expected_id: "x") }
        .to raise_error(Layouts::InvalidContract, /formato desconhecido/)
      expect {
        Layouts::Contract.new({ "id" => "x", "formats" => [ "story" ], "background_options" => [ "color" ],
          "slots" => { "title" => { "type" => "text", "role_default" => "gigante" } } }, expected_id: "x")
      }.to raise_error(Layouts::InvalidContract, /papel 'gigante'/)
    end
  end

  describe ".normalize" do
    it "cria ids, aplica os defaults do layout e corta chave estranha" do
      doc = document("story", slide("text-only-solid", [ { "slot" => "title", "content" => " Oi ", "hex" => "#ff0000", "sizeStep" => 9 } ]))

      expect(doc["canvas"]).to eq("width" => 1080, "height" => 1920)
      s = doc["slides"].first
      expect(PieceDocument.uuid?(s["id"])).to be(true)
      expect(s["background"]).to eq("type" => "color", "colorToken" => "primary")
      title = s["blocks"].first
      expect(title).to include("content" => "Oi", "styleRole" => "display", "sizeStep" => 2, "align" => "left", "visible" => true)
      expect(title).not_to have_key("hex")
    end

    it "bloco sem slot no layout vai para órfãos; slot obrigatório sem bloco entra vazio" do
      doc = document("feed_portrait", slide("text-only-solid", [
        { "slot" => "price", "type" => "text", "content" => "R$ 18" },
        { "slot" => "body", "content" => "Todo dia." }
      ]))

      s = doc["slides"].first
      expect(s["orphans"].map { |b| b["slot"] }).to eq([ "price" ])
      expect(s["blocks"].map { |b| b["slot"] }).to eq(%w[title body])
      expect(s["blocks"].first["content"]).to eq("")
    end

    it "o órfão volta quando o layout tem o slot de novo" do
      first = document("feed_portrait", slide("product-card", [ { "slot" => "title", "content" => "Pão" }, { "slot" => "price", "content" => "R$ 18" } ]))
      moved = first.deep_dup
      moved["slides"].first["layoutId"] = "text-only-solid"
      moved = described_class.normalize(moved)
      expect(moved["slides"].first["orphans"].map { |b| b["content"] }).to eq([ "R$ 18" ])

      back = moved.deep_dup
      back["slides"].first["layoutId"] = "product-card"
      back["slides"].first["blocks"] += back["slides"].first.delete("orphans")
      back = described_class.normalize(back)
      expect(back["slides"].first["blocks"].map { |b| b["slot"] }).to include("price")
    end

    it "ponto focal fica entre 0 e 1 e hashtags ganham # sem espaço" do
      doc = described_class.normalize({ "format" => "feed_square", "slides" => [
        slide("hero-image-title-bottom", [ { "slot" => "image", "focalPoint" => { "x" => 3, "y" => -1 } } ])
      ], "caption" => { "hashtags" => [ "pão quente", "#pao quente", "" ] } })

      image = doc["slides"].first["blocks"].find { |b| b["slot"] == "image" }
      expect(image["focalPoint"]).to eq("x" => 1.0, "y" => 0.0)
      expect(doc["caption"]["hashtags"]).to eq([ "#pãoquente", "#paoquente" ])
    end
  end

  describe "Validator" do
    it "texto longo é aviso para quem edita e erro para o agente" do
      doc = document("feed_portrait", slide("text-only-solid", [ { "slot" => "title", "content" => "x" * 100 } ]))

      loose = validate(doc)
      expect(loose).to be_valid
      expect(loose.warnings).to eq([ [ "slides[0].blocks[0].content", "tooLong", "100/90" ] ])
      expect(validate(doc, strict: true).errors.map(&:second)).to eq([ "tooLong" ])
    end

    it "aponta o erro pelo caminho" do
      doc = document("feed_portrait", slide("text-only-solid", [ { "slot" => "title", "content" => "Oi" } ]))
      doc["slides"].first["background"]["colorToken"] = "vermelho"
      doc["slides"].first["blocks"].first["slot"] = "subtitulo"

      paths = validate(doc).errors.map(&:first)
      expect(paths).to include("slides[0].background.colorToken", "slides[0].blocks[0].slot")
    end

    it "só aceita imagem desta marca" do
      foreign = create(:brand_asset, :photo)
      doc = document("feed_portrait", slide("hero-image-title-bottom", [
        { "slot" => "title", "content" => "Oi" }, { "slot" => "image", "assetId" => foreign.id }
      ]))
      expect(validate(doc).errors.map(&:second)).to eq([ "foreignAsset" ])
    end

    it "peça única tem uma lâmina; carrossel, de 2 a 10" do
      two = document("feed_portrait", slide("text-only-solid", []), slide("text-only-solid", []))
      expect(validate(two).errors.map(&:second)).to include("singleSlide")

      eleven = document("carousel", *Array.new(11) { slide("carousel-body", []) })
      expect(validate(eleven).errors.map(&:second)).to include("carouselSize")
    end
  end

  describe "Compact" do
    it "é o caminho inverso do Build" do
      raw = {
        "format" => "feed_portrait",
        "slides" => [ { "layout" => "product-card", "background" => { "colorToken" => "surface" }, "align" => "center",
                        "content" => { "title" => "Pão de queijo", "price" => "R$ 6", "logo" => false } } ],
        "caption" => { "text" => "Saiu agora.", "hashtags" => [ "#paodequeijo" ] }
      }
      doc = PieceDocument::Build.from_agent(raw, brand_core: brand)
      compact = PieceDocument::Compact.call(doc)

      expect(compact["slides"].first).to eq(
        "layout" => "product-card", "background" => { "colorToken" => "surface" }, "align" => "center",
        "content" => { "title" => "Pão de queijo", "price" => "R$ 6", "logo" => false }
      )
      expect(PieceDocument::Build.from_agent(compact, brand_core: brand)["slides"].first["blocks"].map { |b| b.except("id") })
        .to eq(doc["slides"].first["blocks"].map { |b| b.except("id") })
    end
  end

  describe "Legacy" do
    def legacy(engine_id, values, format: "post")
      piece = create(:piece, brand_core: brand, engine_id: engine_id, values: values, format: format)
      PieceDocument::Legacy.call(piece)
    end

    it "motor com equivalente vira documento, com o fundo virando token" do
      dark = brand.full_document["palette"]["colors"].find { |c| c["role"] == "darkBackground" }
      doc = legacy("statement", { "phrase" => "Pão leva tempo.", "price" => "R$ 18", "background" => dark["id"] })

      s = doc["slides"].first
      expect(s["layoutId"]).to eq("text-only-solid")
      expect(s["background"]).to eq("type" => "color", "colorToken" => "primary")
      expect(s["blocks"].map { |b| [ b["slot"], b["content"] ] }).to include([ "title", "Pão leva tempo." ], [ "body", "R$ 18" ])
      expect(validate(doc)).to be_valid
    end

    it "campo sem slot fica em órfãos, e motor sem equivalente não converte" do
      doc = legacy("promo_box", { "title" => "Combo", "support" => "Só hoje", "tag" => "novo", "description" => "Pão e café", "price" => "R$ 12" })
      expect(doc["slides"].first["orphans"].map { |b| b["content"] }).to eq([ "Só hoje" ])
      expect(legacy("tabela", { "title" => "Horários", "rows" => [ "seg 7h" ] })).to be_nil
    end
  end

  describe "versões" do
    it "não mudam depois de gravadas, mas saem junto com a peça" do
      piece = create(:piece, engine_id: nil, format: "feed_portrait", status: "draft", brand_core: brand)
      doc = document("feed_portrait", slide("text-only-solid", [ { "slot" => "title", "content" => "Oi" } ]))
      version = piece.record_version!(doc, source: "generation")

      expect { version.update!(summary: "outra") }.to raise_error(ActiveRecord::ReadOnlyRecord)
      expect { piece.destroy! }.to change(PieceVersion, :count).by(-1)
    end
  end
end
