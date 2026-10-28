require "rails_helper"

# O arrasto livre: o bloco que sai do lugar do layout ganha `frame` (px do
# canvas), preso na área segura; trocar de layout devolve; os renderizadores
# desenham no lugar arrastado.
RSpec.describe "PieceDocument — arrasto livre" do
  let(:brand) { create(:brand_core, :published) }
  let(:photo) { create(:brand_asset, :photo, brand_core: brand) }

  def document(format = "feed_portrait")
    PieceDocument::Build.from_agent({
      "format" => format,
      "slides" => [ { "layout" => "hero-image-title-bottom", "content" => { "title" => "Pão quente", "body" => "Saindo agora.", "image" => photo.id } } ]
    }, brand_core: brand)
  end

  def apply(doc, *ops) = PieceDocument::Operations.apply(doc, ops, brand_core: brand)

  def slide_id(doc) = doc["slides"][0]["id"]

  def block(doc, slot) = doc["slides"][0]["blocks"].find { |b| b["slot"] == slot }

  it "texto ganha posição sem altura; foto e logo, com altura" do
    doc = document
    result = apply(doc,
      { "op" => "set_frame", "slideId" => slide_id(doc), "slot" => "title", "frame" => { "x" => 120, "y" => 300, "w" => 600, "h" => 999 } },
      { "op" => "set_frame", "slideId" => slide_id(doc), "slot" => "image", "frame" => { "x" => 0, "y" => 0, "w" => 1080, "h" => 600 } })

    expect(result.rejected).to be_empty
    expect(block(result.document, "title")["frame"]).to eq("x" => 120.0, "y" => 300.0, "w" => 600.0)
    expect(block(result.document, "image")["frame"]).to eq("x" => 0.0, "y" => 0.0, "w" => 1080.0, "h" => 600.0)
  end

  it "texto e logo ficam na área segura; no story, fora das faixas do Instagram" do
    doc = document("story")
    result = apply(doc, { "op" => "set_frame", "slideId" => slide_id(doc), "slot" => "title", "frame" => { "x" => -50, "y" => 10, "w" => 2000 } })
    expect(block(result.document, "title")["frame"]).to eq("x" => 40.0, "y" => 220.0, "w" => 1000.0)
  end

  it "devolver ao layout tira o frame; trocar de layout também" do
    doc = document
    moved = apply(doc, { "op" => "set_frame", "slideId" => slide_id(doc), "slot" => "title", "frame" => { "x" => 100, "y" => 100, "w" => 500 } }).document
    back = apply(moved, { "op" => "set_frame", "slideId" => slide_id(moved), "slot" => "title", "frame" => nil }).document
    expect(block(back, "title")).not_to have_key("frame")

    swapped = apply(moved, { "op" => "set_layout", "slideId" => slide_id(moved), "layoutId" => "text-only-solid" }).document
    expect(block(swapped, "title")).not_to have_key("frame")
  end

  it "o libvips desenha o texto arrastado onde ele foi posto" do
    doc = document
    renderer = PieceRenderers::Libvips.new(brand)
    before = Vips::Image.new_from_buffer(renderer.render(doc).first["png"], "")
    moved = apply(doc, { "op" => "set_frame", "slideId" => slide_id(doc), "slot" => "title", "frame" => { "x" => 80, "y" => 120, "w" => 700 } }).document
    after = Vips::Image.new_from_buffer(renderer.render(moved).first["png"], "")

    # A faixa de cima (onde o título foi parar) mudou; e o documento continua válido.
    top_before = before.crop(80, 120, 700, 120).avg
    top_after = after.crop(80, 120, 700, 120).avg
    expect(top_after).not_to be_within(0.5).of(top_before)
    expect(PieceDocument::Validator.call(moved, brand_core: brand)).to be_valid
  end
end
