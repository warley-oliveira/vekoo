require "rails_helper"

RSpec.describe ReferenceCard do
  def error_keys(card)
    card.errors.attribute_names.map(&:to_s)
  end

  describe "rascunho" do
    it "nasce em rascunho, externo, com a análise vazia na forma inteira" do
      card = create(:reference_card)

      expect(card).to have_attributes(status: "draft", origin: "external", version: 1)
      expect(card.analysis.keys).to eq(%w[hook structure visual copy whyItWorks replicability metrics])
      expect(card.analysis.dig("hook", "type")).to be_nil
    end

    it "aceita campos da taxonomia em branco enquanto a curadoria não decide" do
      expect(build(:reference_card, niche: "", objective: nil, archetypes: [])).to be_valid
    end

    it "recusa código fora da taxonomia" do
      card = build(:reference_card, niche: "padaria", size: "huge", objective: "sell", format: "tiktok", archetypes: %w[premium_minimal hipster])

      expect(card).not_to be_valid
      expect(error_keys(card)).to include("niche", "size", "objective", "format", "archetypes")
    end

    it "limita a três arquétipos e tira os repetidos" do
      card = build(:reference_card, archetypes: %w[premium_minimal premium_minimal popular_warm])
      expect(card).to be_valid
      expect(card.archetypes).to eq(%w[premium_minimal popular_warm])

      card.archetypes = Taxonomy::ARCHETYPES.first(4)
      expect(card).not_to be_valid
      expect(card.errors.details[:archetypes]).to include(error: :too_many_items)
    end

    it "aponta o erro da análise no caminho do campo" do
      card = build(:reference_card, analysis: { "hook" => { "type" => "shout" }, "replicability" => { "score" => 5 } })

      expect(card).not_to be_valid
      expect(error_keys(card)).to include("analysis.hook.type", "analysis.replicability.score")
      expect(card.errors.full_messages).to all(be_present)
    end

    it "corta o texto da análise no limite em vez de recusar" do
      card = build(:reference_card, analysis: { "whyItWorks" => { "mechanism" => "a" * 2_000, "transferablePrinciple" => "b" * 500 } })

      expect(card).to be_valid
      expect(card.analysis.dig("whyItWorks", "mechanism").length).to eq(ReferenceCard::Analysis::PARAGRAPH)
      expect(card.analysis.dig("whyItWorks", "transferablePrinciple").length).to eq(ReferenceCard::Analysis::SENTENCE)
    end
  end

  describe "fonte" do
    it "guarda o canal como @, minúsculo e sem espaço" do
      card = create(:reference_card, source: { "url" => " https://www.tiktok.com/@x/video/1 ", "channel" => "Padaria Exemplo" })

      expect(card.source).to eq("url" => "https://www.tiktok.com/@x/video/1", "channel" => "@padariaexemplo")
    end

    it "recusa url que não é http(s) e @ fora do formato de perfil" do
      card = build(:reference_card, source: { "url" => "javascript:alert(1)", "channel" => "@" + ("a" * 31) })

      expect(card).not_to be_valid
      expect(error_keys(card)).to include("source.url", "source.channel")
    end

    it "descarta chave que a forma não conhece" do
      card = create(:reference_card, source: { "url" => "https://instagram.com/p/1", "token" => "segredo" })

      expect(card.source.keys).to eq(%w[url])
    end
  end

  describe "colunas derivadas da análise" do
    it "refletem gancho, replicabilidade e engajamento relativo" do
      card = create(:reference_card, :analyzed)

      # (840 + 60) / 300
      expect(card).to have_attributes(hook_type: "curiosity", replicability: 3, relative_engagement: 3.0)
    end

    it "ficam nulas quando a análise não diz — sem métrica não há engajamento" do
      card = create(:reference_card, :analyzed)
      card.update!(analysis: card.analysis.merge("metrics" => { "likes" => 10 }))

      expect(card.relative_engagement).to be_nil
      expect(card.analysis.dig("metrics", "relativeEngagement")).to be_nil
    end

    it "ignoram o engajamento relativo digitado: ele é sempre a conta" do
      card = create(:reference_card, :analyzed)
      card.update!(analysis: card.analysis.deep_merge("metrics" => { "relativeEngagement" => 99 }))

      expect(card.relative_engagement).to eq(3.0)
    end
  end

  describe "layout sugerido" do
    it "existe na biblioteca de layouts" do
      card = build(:reference_card, suggested_layout_id: "layout-que-nao-existe")

      expect(card).not_to be_valid
      expect(card.errors.details[:suggested_layout_id]).to include(error: :inclusion)
    end

    it "sai num formato de peça que o card serve" do
      expect(build(:reference_card, format: "carousel", suggested_layout_id: "carousel-cover")).to be_valid
      expect(build(:reference_card, format: "story", suggested_layout_id: "carousel-cover")).not_to be_valid
      # Reels ainda não tem formato de peça: nenhum layout serve.
      expect(build(:reference_card, format: "reels", suggested_layout_id: "text-only-solid")).not_to be_valid
    end
  end

  describe "curadoria" do
    it "segue os caminhos permitidos" do
      card = create(:reference_card, :analyzed)

      card.status = "draft"
      expect(card).to be_valid

      card.reload.status = "published"
      expect(card.save).to be(true)

      card.status = "draft"
      expect(card).not_to be_valid
      expect(card.errors.details[:status]).to include(error: :invalid_transition, from: "published", to: "draft")
    end

    it "não publica sem a análise inteira e o encaixe na taxonomia" do
      card = create(:reference_card, :analyzed, niche: nil, archetypes: [])
      card.analysis = card.analysis.deep_merge("copy" => { "cta" => "" }, "replicability" => { "score" => nil })
      card.save!

      card.status = "published"
      expect(card).not_to be_valid
      expect(error_keys(card)).to include("niche", "archetypes", "analysis.copy.cta", "analysis.replicability.score")
    end

    it "arquiva (rejeita) só com motivo" do
      card = create(:reference_card, :analyzed)

      card.status = "archived"
      expect(card).not_to be_valid
      expect(card.errors.details[:archived_reason]).to include(error: :blank)

      card.archived_reason = "Depende de celebridade em cena."
      expect(card.save).to be(true)
    end

    it "marca a data da primeira publicação" do
      card = create(:reference_card, :published)

      expect(card.published_at).to be_within(5.seconds).of(Time.current)
    end
  end

  describe "versão" do
    it "não conta revisão antes da primeira publicação" do
      card = create(:reference_card, :analyzed)
      card.update!(objective: "launch")

      expect(card.version).to eq(1)
    end

    it "sobe a cada mudança de conteúdo depois de publicado" do
      card = create(:reference_card, :published)

      card.update!(objective: "launch")
      expect(card.version).to eq(2)

      card.update!(analysis: card.analysis.deep_merge("copy" => { "tone" => "Seco e direto." }))
      expect(card.version).to eq(3)
    end

    it "não sobe com mudança de status nem gravação sem mudança" do
      card = create(:reference_card, :published)

      card.update!(status: "archived", archived_reason: "Aposentado.")
      card.save!
      expect(card.version).to eq(1)
    end
  end

  describe "embedding" do
    it "guarda o vetor normalizado, nas 768 dimensões da coluna" do
      card = create(:reference_card, embedding: [ 3.0, 4.0 ] + [ 0.0 ] * 766)

      expect(card.reload.embedding.first(2)).to eq([ 0.6, 0.8 ])
    end

    it "recusa vetor de outro tamanho" do
      card = build(:reference_card, embedding: [ 1.0, 2.0 ])

      expect(card).not_to be_valid
      expect(card.errors.attribute_names).to include(:embedding)
    end

    it "encontra o vizinho mais próximo por cosseno" do
      near = create(:reference_card, embedding: [ 1.0, 0.1 ] + [ 0.0 ] * 766)
      create(:reference_card, embedding: [ 0.0, 1.0 ] + [ 0.0 ] * 766)

      nearest = described_class.nearest_neighbors(:embedding, [ 1.0, 0.0 ] + [ 0.0 ] * 766, distance: "cosine").first
      expect(nearest).to eq(near)
    end
  end

  it "devolve os originais na ordem em que entraram — a ordem do post" do
    card = create(:reference_card)
    %w[capa meio fim].each do |name|
      card.originals.attach(io: file_fixture("foto.png").open, filename: "#{name}.png", content_type: "image/png")
    end

    expect(card.reload.ordered_originals.map { |o| o.filename.to_s }).to eq(%w[capa.png meio.png fim.png])
  end

  it "serve os formatos de peça do seu formato de referência" do
    expect(build(:reference_card, format: "static").piece_formats).to eq(%w[feed_square feed_portrait])
    expect(build(:reference_card, format: "reels").piece_formats).to eq([])
  end
end
