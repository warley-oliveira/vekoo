require "rails_helper"

# A busca da geração: filtro duro, pontos, mínimo por regra e diversidade. O
# vetor é de brinquedo (eixos de 768 dimensões) e a intenção entra pronta —
# nenhuma chamada sai daqui.
RSpec.describe References::Retriever do
  def axis(*hot) = Array.new(Ai::Embeddings::DIMENSIONS, 0.0).tap { |vector| hot.each { |index| vector[index] = 1.0 } }

  let(:identity) { { "niche" => "food_beverage", "archetypes" => { "primary" => "natural_artisanal", "secondary" => "popular_warm" } } }
  let(:offers) { nil }
  let(:brand) do
    create(:brand_core, :published).tap do |brand|
      document = brand.document.deep_merge("identity" => identity)
      document = document.merge("offers" => { "items" => offers }) if offers
      brand.update_columns(document: document, published_document: document)
    end
  end
  let(:intent) { References::Intent::Result.new(objective: "behind_the_scenes", format: nil, brings: [], cost_micro_usd: 0) }
  let(:embedder) { instance_double(Ai::Embeddings, embed: axis(0)) }

  def card(channel, hook: "curiosity", niche: "food_beverage", objective: "behind_the_scenes", style: "natural_artisanal",
    vector: axis(0), status: "published", requires: [], replicability: 3, format: "carousel")
    create(:reference_card, :published, niche: niche, objective: objective, archetypes: [ style ], format: format,
      source: { "url" => "https://www.instagram.com/p/#{channel.delete('@')}/", "channel" => channel }).tap do |card|
      card.update_columns(status: status, hook_type: hook, replicability: replicability, requires: requires, embedding: vector)
    end
  end

  def search(text = "mostrar os bastidores da fornada das 5 da manhã", **options)
    described_class.call(brand, text, intent: intent, embedder: embedder, **options)
  end

  it "escolhe até 3 cards, com a conta de cada critério, na ordem dos pontos" do
    best = card("@conta_a", hook: "curiosity", vector: axis(0))
    second = card("@conta_b", hook: "number", vector: axis(0, 1))
    third = card("@conta_c", hook: "visual", style: "popular_warm", vector: axis(0, 1, 2))
    card("@conta_d", hook: "promise", objective: "launch", style: "bold_energetic", vector: axis(3))

    result = search

    expect(result.cards).to eq([ best, second, third ])
    expect(result.picks.first.points).to eq(niche: 3, archetype: 2, objective: 2, similarity: 3.0, engagement: 1, missing: 0)
    expect(result.picks.last.points).to include(archetype: 1)
    expect(result).to have_attributes(niche: "food_beverage", similarity: true, candidates: 4)
  end

  it "deixa de fora rascunho, em revisão, replicabilidade 1 e card sem vetor" do
    keep = card("@conta_a")
    card("@conta_b", status: "in_review", hook: "number", vector: axis(0, 1))
    card("@conta_c", replicability: 1, hook: "visual", vector: axis(0, 2))
    card("@conta_d", vector: nil, hook: "promise")

    expect(search.cards).to eq([ keep ])
  end

  it "filtra o formato só quando o pedido diz qual é" do
    carousel = card("@conta_a")
    single = card("@conta_e", format: "static", hook: "question", vector: axis(0, 1))
    asking = ->(format) { described_class.call(brand, "bastidores", intent: intent.dup.tap { |value| value.format = format }, embedder: embedder).cards }

    expect(asking.call(nil)).to contain_exactly(carousel, single)
    expect(asking.call("static")).to eq([ single ])
    expect(asking.call("carousel")).to eq([ carousel ])
  end

  it "card do nicho precisa bater objetivo ou estilo" do
    card("@conta_objetivo", style: "bold_energetic")
    card("@conta_estilo", objective: "launch", hook: "number", vector: axis(0, 1))
    card("@conta_nenhum", objective: "launch", style: "bold_energetic", hook: "visual", vector: axis(0, 2))

    expect(search.cards.map { |c| c.source["channel"] }).to contain_exactly("@conta_objetivo", "@conta_estilo")
  end

  describe "outro nicho" do
    it "fica de fora quando o nicho da marca tem cards suficientes" do
      3.times { |index| card("@conta_padaria#{index}", hook: %w[curiosity number visual][index], vector: axis(0, index + 1)) }
      card("@conta_pet", niche: "pet", hook: "promise")

      expect(search.cards.map(&:niche).uniq).to eq([ "food_beverage" ])
    end

    it "completa o nicho raso, só com estilo e objetivo batendo" do
      card("@conta_padaria")
      card("@conta_pet", niche: "pet", hook: "number", vector: axis(0, 1))
      card("@conta_pet_sem_estilo", niche: "pet", style: "bold_energetic", hook: "visual", vector: axis(2))

      result = search

      expect(result.cards.map { |c| c.source["channel"] }).to eq([ "@conta_padaria", "@conta_pet" ])
      expect(result.picks.last.points[:niche]).to eq(0)
    end
  end

  it "não repete conta, gancho nem padrão quase igual" do
    card("@conta_a", hook: "curiosity", vector: axis(0))
    card("@conta_a", hook: "number", vector: axis(0, 5))
    card("@conta_b", hook: "curiosity", vector: axis(0, 6))
    card("@conta_c", hook: "visual", vector: axis(0).tap { |vector| vector[7] = 0.1 })
    spread = card("@conta_d", hook: "promise", vector: axis(0, 1))

    result = search

    expect(result.cards.map { |c| c.source["channel"] }).to eq([ "@conta_a", "@conta_d" ])
    expect(result.cards.last).to eq(spread)
  end

  describe "o que o post exige" do
    let(:offers) { [ { "id" => "o1", "name" => "Pão", "price" => "", "description" => "", "validity" => "" } ] }

    it "desconta a exigência que a marca comprovadamente não cumpre" do
      card("@conta_promo", requires: %w[promotion customer])

      pick = search.picks.first

      expect(pick.missing).to eq(%w[promotion])
      expect(pick.points[:missing]).to eq(-2)
    end

    it "não desconta quando o pedido traz o que falta" do
      card("@conta_promo", requires: %w[promotion])
      with_price = intent.dup.tap { |value| value.brings = %w[promotion] }

      pick = described_class.call(brand, "combo por R$ 12", intent: with_price, embedder: embedder).picks.first

      expect(pick.missing).to be_empty
    end

    it "conta a foto anexada ao pedido como foto do produto" do
      card("@conta_foto", requires: %w[product_photo])

      expect(search.picks.first.missing).to eq(%w[product_photo])
      expect(search(attachments: [ "asset-1" ]).picks.first.missing).to be_empty
    end
  end

  it "sem o vetor do pedido, segue só pelas colunas" do
    card("@conta_a")
    failing = instance_double(Ai::Embeddings)
    allow(failing).to receive(:embed).and_raise(Net::ReadTimeout)

    result = described_class.call(brand, "bastidores", intent: intent, embedder: failing)

    expect(result).to have_attributes(similarity: false)
    expect(result.picks.first.points[:similarity]).to eq(0)
  end

  it "o mais variações pede outros cards" do
    used = card("@conta_a")
    other = card("@conta_b", hook: "number")

    expect(search(exclude_ids: [ used.id ]).cards).to eq([ other ])
  end

  it "marca sem publicação não busca nada" do
    draft = create(:brand_core, :complete)
    card("@conta_a")

    expect(described_class.call(draft, "bastidores", intent: intent, embedder: embedder).picks).to be_empty
    expect(embedder).not_to have_received(:embed)
  end
end
