require "rails_helper"

# A descrição da foto enviada pela marca. O `Ai::Chat` é um dublê: o que se
# confere é o que vai ao modelo, o que se grava e que nada aqui derruba o
# envio.
RSpec.describe DescribeBrandAsset do
  let(:brand) { create(:brand_core) }
  let(:photo) { create(:brand_asset, :photo, brand_core: brand) }

  def chat_answering(payload)
    instance_double(Ai::Chat).tap do |chat|
      allow(chat).to receive(:answer).and_return(
        Ai::Chat::Answer.new(text: JSON.generate(payload), usage: { input: 1_700, output: 180, cacheRead: 0, cacheWrite: 0 }, model: "claude-haiku-5-5")
      )
    end
  end

  before { allow(Ai::Chat).to receive(:available?).and_return(true) }

  it "grava a descrição, o que a foto comprova e o custo" do
    chat = chat_answering("description" => "Fachada de prédio de tijolos, céu azul no alto.", "shows" => %w[product_photo promotion inventado])

    expect(described_class.call(photo, chat: chat)).to be(true)

    photo.reload
    expect(photo.description).to eq("Fachada de prédio de tijolos, céu azul no alto.")
    expect(photo.shows).to eq(%w[product_photo])
    expect(photo.described_at).to be_present
    expect(photo.description_cost_micro_usd).to be > 0
  end

  it "descrição longa demais corta na última frase inteira" do
    long = "Primeira frase sobre a foto. " * 20
    described_class.call(photo, chat: chat_answering("description" => long, "shows" => []))

    description = photo.reload.description
    expect(description.length).to be <= described_class::MAX_DESCRIPTION
    expect(description).to end_with("foto.")
  end

  it "manda a foto reduzida e o negócio cercado como dado, ao modelo pequeno" do
    chat = chat_answering("description" => "Cozinha clara.", "shows" => [])

    described_class.call(photo, chat: chat)

    expect(chat).to have_received(:answer) { |system:, messages:, model:, effort:, schema:, **|
      expect(model).to eq("claude-haiku-5-5")
      expect(effort).to eq("low")
      expect(schema).to eq(described_class::OUTPUT_SCHEMA)
      expect(system.first[:text]).to include("`space`").and include("`customer`")
      expect(system.first[:text]).not_to include("`promotion`")
      image, text = messages.first[:content]
      expect(image).to include(type: "image")
      expect(image.dig(:source, :media_type)).to eq("image/jpeg")
      expect(text[:text]).to start_with("<<<NEGÓCIO").and end_with("NEGÓCIO>>>")
    }
  end

  it "não chama o modelo para foto gerada, logo, foto já descrita ou sem chave" do
    chat = chat_answering("description" => "x", "shows" => [])
    generated = create(:brand_asset, :photo, brand_core: brand, generated: true)
    logo = create(:brand_asset, brand_core: brand)
    described = create(:brand_asset, :photo, brand_core: brand, description: "Já tem.")

    expect(described_class.call(generated, chat: chat)).to be(false)
    expect(described_class.call(logo, chat: chat)).to be(false)
    expect(described_class.call(described, chat: chat)).to be(true)
    allow(Ai::Chat).to receive(:available?).and_return(false)
    expect(described_class.call(photo, chat: chat)).to be(false)

    expect(chat).not_to have_received(:answer)
  end

  it "com FORCE, descreve de novo a que já tinha descrição" do
    described = create(:brand_asset, :photo, brand_core: brand, description: "Antiga.")

    described_class.call(described, chat: chat_answering("description" => "Nova.", "shows" => %w[space]), force: true)

    expect(described.reload).to have_attributes(description: "Nova.", shows: %w[space])
  end

  it "teto batido ou modelo fora: a foto fica sem descrição, sem levantar" do
    allow(Agent::Budget).to receive(:check!).and_raise(Agent::Budget::CapReached)
    capped = chat_answering("description" => "x", "shows" => [])
    expect(described_class.call(photo, chat: capped)).to be(false)
    expect(capped).not_to have_received(:answer)

    allow(Agent::Budget).to receive(:check!).and_return(true)
    down = instance_double(Ai::Chat)
    allow(down).to receive(:answer).and_raise(Ai::Chat::Failed, "overloaded")
    expect(described_class.call(photo, chat: down)).to be(false)
    expect(photo.reload.description).to be_nil
  end

  it "o custo entra no teto de OPEX da organização" do
    described_class.call(photo, chat: chat_answering("description" => "Cozinha.", "shows" => []))

    expect(BrandAsset.description_cost_micro_usd_since(brand.organization, 1.hour.ago)).to eq(photo.reload.description_cost_micro_usd)
  end

  describe "no envio" do
    it "enfileira a descrição só da foto enviada" do
      generated = create(:brand_asset, :photo, brand_core: brand, generated: true)
      logo = create(:brand_asset, brand_core: brand)

      expect {
        [ photo, generated, logo ].each { |asset| AnalyzeBrandAsset.call(asset, StringIO.new(asset.file.download)) }
      }.to have_enqueued_job(DescribeBrandAssetJob).with(photo.id).exactly(:once)
    end
  end
end
