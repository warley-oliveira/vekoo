require "rails_helper"

# O nicho deduzido para marcas sem `identity.niche`. Nicho errado dá +3 ao card
# errado na recuperação; vazio só perde o bônus — na dúvida, vazio.
RSpec.describe BrandCore::NicheInference do
  def infer(segment, concept: nil, code: nil)
    described_class.infer(segment: segment, concept: concept, segment_code: code)
  end

  describe "palavras-chave (acento, caixa e plural não importam)" do
    {
      "food_beverage" => [
        "Bar e petiscaria", "Boteco do Zé", "Restaurante japonês", "Café de especialidade", "Cafeteria",
        "Padaria artesanal", "Hamburgueria", "LANCHONETE", "padarias de bairro"
      ],
      "real_estate" => [
        "Imobiliária de alto padrão", "imobiliaria", "Imóveis na planta", "imovel usado", "Corretora de imóveis",
        "corretores autônomos", "Incorporadora"
      ],
      "healthcare" => [ "Clínica médica", "clinicas populares", "Consultório de psicologia", "Odontologia", "Dentista" ],
      "beauty_aesthetics" => [
        "Salão de beleza", "Barbearia", "Estética facial", "Clínica de estética", "Cosméticos naturais", "Perfumaria"
      ],
      "fitness" => [ "Academia de bairro", "Personal trainer", "Estúdio de pilates" ],
      "home_construction" => [
        "Móveis planejados", "Loja de decoração", "Material de construção", "Arquitetura de interiores", "Reformas"
      ],
      "pet" => [ "Pet shop", "Petshop", "Clínica veterinária", "Banho e tosa" ]
    }.each do |niche, segments|
      segments.each do |segment|
        it "#{segment} → #{niche}" do
          expect(infer(segment)).to eq(niche)
        end
      end
    end

    [
      "Corretora de seguros", "Salão de festas", "Academia de idiomas", "Personal stylist",
      "Barra de cereais", "Consultoria de marketing", "Loja de vinis raros"
    ].each do |segment|
      it "#{segment} → nenhum (palavra parecida, outro ramo)" do
        expect(infer(segment)).to be_nil
      end
    end
  end

  describe "código do ramo do onboarding" do
    it "loja e serviço sem palavra correspondente ficam sem nicho" do
      expect(infer("Loja", code: "shop")).to be_nil
      expect(infer("Consultoria de marketing", code: "services")).to be_nil
      expect(infer("", code: "creator")).to be_nil
      expect(infer("", code: "other")).to be_nil
    end

    it "loja e serviço com palavra seguem a palavra" do
      expect(infer("imobiliária de imóveis de alto padrão", code: "services")).to eq("real_estate")
      expect(infer("Pet shop e farmácia veterinária", code: "shop")).to eq("pet")
    end

    it "restaurante, saúde e educação têm padrão quando a palavra não diz nada" do
      expect(infer("Comida caseira", code: "restaurant")).to eq("food_beverage")
      expect(infer("Nutricionista", code: "health")).to eq("healthcare")
      expect(infer("cursos de alta performance esportiva", code: "education")).to eq("education")
    end

    it "código com padrão só desvia para o que cabe nele" do
      expect(infer("Academia e nutrição", code: "health")).to eq("fitness")
      expect(infer("Estética e bem-estar", code: "health")).to eq("beauty_aesthetics")
      # "Cursos para dentistas" é educação; restaurante com loja de móveis é restaurante.
      expect(infer("Cursos para dentistas", code: "education")).to eq("education")
      expect(infer("Restaurante e loja de móveis", code: "restaurant")).to eq("food_beverage")
    end
  end

  it "vale a palavra que aparece primeiro" do
    expect(infer("Imobiliária e decoração")).to eq("real_estate")
    expect(infer("Decoração e imóveis")).to eq("home_construction")
  end

  it "procura no conceito quando o ramo não diz nada" do
    expect(infer("Loja", concept: "Roupas e ração para pets", code: "shop")).to eq("pet")
    expect(infer("Imobiliária", concept: "Padaria no térreo")).to eq("real_estate")
  end

  it "lê o documento do Brandcore" do
    document = { "identity" => { "segment" => "", "concept" => "Hamburgueria artesanal no centro" } }

    expect(described_class.call(document)).to eq("food_beverage")
    expect(described_class.call({}, segment_code: "education")).to eq("education")
  end
end
