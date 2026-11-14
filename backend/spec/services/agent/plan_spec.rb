require "rails_helper"

# O plano é a fronteira entre "o que o modelo disse" e "o que a biblioteca de
# layouts consegue desenhar". Nada aqui toca a rede: entra texto, sai
# `PieceDocument` validado — ou a lista de erros que volta ao modelo.
RSpec.describe Agent::Plan do
  let(:brand) { create(:brand_core, :published) }
  let(:photo) { create(:brand_asset, :photo, brand_core: brand) }

  def plan(raw, limit: described_class::MAX_VARIATIONS)
    described_class.call(raw, brand_core: brand, request_text: "post do pão", limit: limit)
  end

  def variation(overrides = {})
    {
      "format" => "feed_portrait",
      "title" => "Pão de verdade",
      "slides" => [ {
        "layout" => "text-only-solid",
        "background" => { "colorToken" => "primary" },
        "content" => { "title" => "Pão de verdade\nleva tempo.", "body" => "R$ 18" }
      } ],
      "caption" => { "text" => "Todo dia às 6h.", "hashtags" => [ "pao", "#fermentacao natural" ] },
      "why" => "fundo escuro, frase seca"
    }.merge(overrides)
  end

  def answer(*variations, question: nil)
    JSON.generate({ "question" => question, "variations" => variations })
  end

  it "monta o documento canônico a partir da forma compacta" do
    result = plan(answer(variation))

    expect(result).to be_ok
    document = result.variations.first.document
    expect(document).to include("schemaVersion" => 1, "format" => "feed_portrait", "canvas" => { "width" => 1080, "height" => 1350 })
    slide = document["slides"].first
    expect(slide["background"]).to eq("type" => "color", "colorToken" => "primary")
    expect(slide["blocks"].map { |b| [ b["slot"], b["styleRole"] ] }).to eq([ %w[title display], %w[body body], [ "logo", nil ] ])
    expect(slide["blocks"].last).to include("type" => "logo", "visible" => true, "variant" => "dark")
    expect(document["caption"]["hashtags"]).to eq([ "#pao", "#fermentacaonatural" ])
    expect(document["meta"]).to include("requestText" => "post do pão", "generatedBy" => "agent")
  end

  it "acha o JSON mesmo embrulhado em cerca de markdown e conversa fiada" do
    expect(plan("Claro!\n```json\n#{answer(variation)}\n```")).to be_ok
  end

  it "trata a pergunta como resposta boa, e não como falha" do
    result = plan(answer(question: "Qual é o preço?"))
    expect(result).to be_question
    expect(result.errors).to be_empty
  end

  it "recusa layout que não existe, dizendo qual era" do
    result = plan(answer(variation("slides" => [ { "layout" => "inventado", "content" => {} } ])))
    expect(result).not_to be_ok
    expect(result.errors.join).to include("inventado")
  end

  it "recusa layout que não sai no formato pedido" do
    result = plan(answer(variation("format" => "story", "slides" => [ { "layout" => "carousel-body", "content" => { "title" => "Oi" } } ])))
    expect(result.errors.join).to include("formato")
  end

  it "recusa texto fora do limite e nomeia o slot no erro" do
    result = plan(answer(variation("slides" => [ { "layout" => "text-only-solid", "content" => { "title" => "x" * 91 } } ])))
    expect(result.errors.join).to include("slot `title`").and include("91/90")
  end

  it "recusa token de cor que não existe e foto que não é da marca" do
    other = create(:brand_asset, :photo)
    result = plan(answer(variation("slides" => [ {
      "layout" => "hero-image-title-bottom", "background" => { "colorToken" => "vermelho" },
      "content" => { "title" => "Oi", "image" => other.id }
    } ])))
    expect(result.errors.join).to include("não é desta marca")
  end

  it "exige foto no slot de imagem obrigatório, para o agente trocar de layout" do
    result = plan(answer(variation("slides" => [ { "layout" => "hero-image-title-bottom", "content" => { "title" => "Oi" } } ])))
    expect(result.errors.join).to include("slot `image`")

    ok = plan(answer(variation("slides" => [ { "layout" => "hero-image-title-bottom", "content" => { "title" => "Oi", "image" => photo.id } } ])))
    expect(ok).to be_ok
  end

  it "carrossel: capa na primeira, chamada na última, entre 2 e 10 lâminas" do
    slides = [
      { "layout" => "carousel-cover", "content" => { "title" => "3 jeitos de guardar pão" } },
      { "layout" => "carousel-body", "content" => { "title" => "Pano de algodão", "body" => "Respira e não resseca." } },
      { "layout" => "carousel-last-cta", "content" => { "title" => "Salva pra lembrar" } }
    ]
    expect(plan(answer(variation("format" => "carousel", "slides" => slides)))).to be_ok

    wrong = plan(answer(variation("format" => "carousel", "slides" => slides.reverse)))
    expect(wrong.errors.join).to include("primeira lâmina").and include("última lâmina")

    single = plan(answer(variation("format" => "carousel", "slides" => slides.first(1))))
    expect(single.errors.join).to include("2–10")
  end

  it "mantém as variações boas e reporta só as ruins" do
    result = plan(answer(variation, variation("format" => "outdoor")))
    expect(result.variations.length).to eq(1)
    expect(result.errors.length).to eq(1)
  end

  it "corta no limite pedido — o ajuste quer uma peça, não três" do
    expect(plan(answer(variation, variation, variation), limit: 1).variations.length).to eq(1)
  end

  it "não explode com resposta que não é JSON" do
    expect(plan("desculpa, não entendi").errors).to eq([ "a resposta não era um objeto JSON" ])
  end

  it "reclama quando não veio nem pergunta nem variação" do
    expect(plan(answer).errors.join).to include("vazio")
  end
end
