require "rails_helper"

# O "cria pra mim" da logo com símbolo, sem rede: o diretor de arte, o gerador
# e o vetorizador são dublês. O que se confere é o encadeamento — quatro
# direções, uma que falha não derruba as outras, cada símbolo vira duas logos
# — e que o símbolo da escolhida vira o glifo da marca.
RSpec.describe Logos::Concepts do
  let(:brand) { create(:brand_core, :complete) }
  let(:account) { create(:account, organization: brand.organization) }
  let(:svg) do
    %(<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><path d="M50 5 A45 45 0 1 1 49.9 5 Z" fill="#3B2A1A"/></svg>)
  end
  let(:png) { Vips::Image.black(64, 64, bands: 3).new_from_image([ 200, 120, 40 ]).copy(interpretation: :srgb).write_to_buffer(".png") }

  let(:chat) do
    concepts = %w[figurative geometric monogram].map { |direction| { "direction" => direction, "idea" => "Ideia #{direction}", "prompt" => "#{direction} symbol" } }
    instance_double(Ai::Chat).tap do |chat|
      allow(chat).to receive(:answer).and_return(
        Ai::Chat::Answer.new(text: JSON.generate("concepts" => concepts), usage: { input: 2_000, output: 600, cacheRead: 0, cacheWrite: 0 }, model: "claude-opus-5-5")
      )
    end
  end

  # O emblema (que veio do prompt-padrão, porque o diretor não o escreveu) falha.
  let(:generator) do
    double("gerador").tap do |generator|
      allow(generator).to receive(:generate) { |prompt:, **|
        raise Ai::GeminiImage::Busy, "HTTP 429" if prompt.start_with?("Emblem")

        Ai::GeminiImage::Result.new(image: Ai::GeminiImage::Image.new(data: png, mime_type: "image/png"), usage: {}, model: "m")
      }
    end
  end
  let(:vectorizer) { instance_double(Logos::Vectorize, call: Logos::Vectorize::Result.new(svg: svg)) }

  before { allow(Ai::Chat).to receive(:available?).and_return(true) }

  def run(arrived: [], failed: [])
    described_class.new(brand, account: account, chat: chat, generator: generator, vectorizer: vectorizer,
      on_concept: ->(direction, ids) { arrived << [ direction, ids ] }, on_failure: ->(direction) { failed << direction }).call
  end

  it "quatro direções; a que falha não derruba as outras; cada símbolo vira duas logos" do
    arrived = []
    failed = []

    result = run(arrived: arrived, failed: failed)

    expect(arrived.map(&:first)).to match_array(%w[figurative geometric monogram])
    expect(failed).to eq(%w[emblem])
    expect(result.logo_ids.size).to eq(6)
    expect(result.cost_micro_usd).to eq(Agent::Pricing.micro_usd("claude-opus-5-5", { input: 2_000, output: 600 }) + (3 * described_class.image_cost))

    logo = brand.reload.logos.find_logo(result.logo_ids.first)
    expect(logo.variants.keys).to eq(%w[light dark])
    expect(logo.concept).to include("direction" => arrived.first.first, "idea" => "Ideia #{arrived.first.first}")
    expect(logo.variant("light").meta["symbolSvg"]).to eq(svg)
    expect(brand.logos.map { |l| l.concept["arrangement"] }.tally).to eq("horizontal" => 3, "stacked" => 3)
  end

  it "o diretor de arte fora do ar: os quatro prompts-padrão, com a regra de não desenhar fundo" do
    allow(chat).to receive(:answer).and_raise(Ai::Chat::Failed, "overloaded")

    briefs = Logos::ArtDirection.new(brand, chat: chat).call.briefs

    expect(briefs.map(&:direction)).to eq(%w[figurative geometric monogram emblem])
    expect(briefs.map(&:prompt)).to all(include("no tile").and(include("pure white background")))
    expect(briefs.find { |b| b.direction == "monogram" }.prompt).to include("single letter")
  end

  it "o símbolo da logo escolhida vira o glifo da marca: claro em SVG, escuro em PNG" do
    result = run
    described_class.adopt_symbol!(brand, result.logo_ids.first, account: account)

    glyphs = brand.reload.assets.where(kind: "glyph")
    expect(glyphs.pluck(:variant, :content_type)).to match_array([ %w[light image/svg+xml], %w[dark image/png] ])
  end
end
