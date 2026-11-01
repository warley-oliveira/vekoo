require "rails_helper"

# O estilo deduzido para marcas publicadas antes do campo. Estilo errado dá +2
# ao card errado na busca de referências; vazio só perde o bônus — na dúvida,
# vazio, como no nicho.
RSpec.describe BrandCore::ArchetypeInference do
  def infer(*texts, tones: [])
    described_class.infer(texts: texts, tones: tones)
  end

  describe "palavras-chave (acento e caixa não importam)" do
    {
      "natural_artisanal" => [ "Pão de fermentação natural", "Cerveja ARTESANAL", "Comida caseira" ],
      "traditional_heritage" => [ "Desde 1958 no bairro", "Receita da avó", "Confeitaria tradicional" ],
      "premium_minimal" => [ "Imóveis de alto padrão", "Joias exclusivas", "Alta gastronomia" ],
      "technical_authority" => [ "Especialistas em implante", "Diagnóstico por imagem", "Equipe técnica certificada" ],
      "caring_welcoming" => [ "Atendimento acolhedor", "Odontologia humanizada" ],
      "popular_warm" => [ "Preço justo todo dia", "Clínicas populares" ],
      "young_irreverent" => [ "Hamburgueria divertida", "Marca jovem e irreverente" ],
      "bold_energetic" => [ "Treino de alta performance", "Academia com energia de sobra" ]
    }.each do |style, texts|
      texts.each do |text|
        it "#{text} → #{style}" do
          expect(infer(text)).to eq("primary" => style, "secondary" => nil)
        end
      end
    end
  end

  it "o tom da voz reforça, mas não decide sozinho" do
    expect(infer("Padaria de bairro", tones: %w[playful])).to eq("primary" => nil, "secondary" => nil)
    expect(infer("Hamburgueria", "Marca jovem", tones: %w[technical playful])).to eq(
      "primary" => "young_irreverent", "secondary" => nil
    )
  end

  it "soma por texto: dois textos do mesmo estilo vencem um de outro, que vira o secundário" do
    expect(infer("Padaria artesanal", "Pão de fermentação natural", "Atendimento acolhedor")).to eq(
      "primary" => "natural_artisanal", "secondary" => "caring_welcoming"
    )
  end

  it "empate no topo não deduz nada" do
    expect(infer("Pão de fermentação natural", "Fala acolhedora")).to eq("primary" => nil, "secondary" => nil)
  end

  it "sem pista, vazio" do
    expect(infer("Padaria de bairro", "Pão e café", tones: %w[warm direct])).to eq("primary" => nil, "secondary" => nil)
  end

  describe "na marca" do
    def brand_with(identity: {}, voice: {}, status: :published)
      create(:brand_core, status).tap do |brand|
        document = brand.document.deep_merge("identity" => identity, "voice" => voice)
        brand.update_columns(document: document, published_document: status == :published ? document : nil)
      end
    end

    it "a geração usa o estilo publicado; sem ele, o deduzido do publicado" do
      chosen = brand_with(identity: { "archetypes" => { "primary" => "bold_energetic", "secondary" => "" } })
      inferred = brand_with(identity: { "concept" => "Pão de fermentação natural, receita artesanal." })

      expect(chosen.generation_archetypes).to include("primary" => "bold_energetic")
      expect(inferred.generation_archetypes).to eq("primary" => "natural_artisanal", "secondary" => nil)
      expect(inferred.reload.document.dig("identity", "archetypes", "primary")).to be_blank
    end

    it "pede confirmação só da marca publicada sem estilo que ainda não escolheu um no rascunho" do
      brand = brand_with(identity: { "concept" => "Pão de fermentação natural, receita artesanal." })
      expect(brand.archetype_suggestion).to eq("primary" => "natural_artisanal", "secondary" => nil)
      expect(BrandCoreSerializer.one(brand)[:styleSuggestion]).to eq("primary" => "natural_artisanal", "secondary" => nil)

      brand.assign_section("identity", brand.full_document["identity"].merge("archetypes" => { "primary" => "natural_artisanal", "secondary" => "" }))
      brand.save!

      expect(brand.archetype_suggestion).to be_nil
      expect(brand_with(identity: { "concept" => "Receita artesanal." }, status: :complete).archetype_suggestion).to be_nil
    end
  end
end
