require "rails_helper"

RSpec.describe Products::IndexTextBuilder do
  let(:organization) { create(:organization) }

  describe ".normalize" do
    it "tira acento e caixa, e colapsa espaço" do
      expect(described_class.normalize("  Cadeira   Ergonômica ÁGIL ")).to eq("cadeira ergonomica agil")
    end

    it "aceita nil" do
      expect(described_class.normalize(nil)).to eq("")
    end
  end

  describe "#primary" do
    it "reúne o que identifica o item" do
      item = build(:product_item, organization: organization, title: "Cadeira Pró", external_id: "SKU-1", tags: [ "promoção", "gamer" ])

      expect(described_class.new(item).primary).to eq("cadeira pro sku-1 promocao gamer")
    end
  end

  describe "#secondary" do
    it "reúne o que descreve o item, normalizado" do
      create(:product_field_definition, organization: organization, name: "Cor")
      item = build(:product_item, organization: organization, summary: "Conforto máximo",
        description: "Estofado em couro", custom_fields: { "cor" => "Azul" })

      text = described_class.new(item, categories: [ [ "moveis/cadeiras", "Cadeiras" ] ]).secondary

      expect(text).to eq("conforto maximo moveis cadeiras azul estofado em couro")
    end

    it "corta a descrição no teto" do
      stub_const("#{described_class}::DESCRIPTION_LIMIT", 10)
      item = build(:product_item, organization: organization, description: "a" * 50)

      expect(described_class.new(item).secondary.length).to eq(10)
    end
  end

  describe "campos personalizados" do
    it "só os pesquisáveis entram no texto" do
      create(:product_field_definition, organization: organization, name: "Cor")
      create(:product_field_definition, organization: organization, name: "Custo", searchable: false)
      item = build(:product_item, organization: organization, custom_fields: { "cor" => "Azul", "custo" => "12" })

      builder = described_class.new(item)

      expect(builder.secondary).to eq("azul")
      expect(builder.embedding_text).not_to include("12")
    end

    it "aceita as chaves prontas, para o importador não consultar a cada linha" do
      item = build(:product_item, organization: organization, custom_fields: { "cor" => "Azul" })

      expect(described_class.new(item, field_definitions: [ "cor" ]).secondary).to eq("azul")
      expect(described_class.new(item, field_definitions: []).secondary).to eq("")
    end
  end

  describe "#embedding_text" do
    # O modelo de embedding entende acento: o texto dele não é o texto do índice.
    it "preserva acento e caixa, com o nome legível das categorias" do
      item = build(:product_item, organization: organization, title: "Cadeira Ergonômica", summary: "Conforto",
        tags: [ "promoção" ], description: "Couro")

      text = described_class.new(item, categories: [ [ "moveis", "Móveis" ] ]).embedding_text

      expect(text).to eq("Cadeira Ergonômica\nConforto\nMóveis\npromoção\nCouro")
    end
  end

  # O banco não promete ordem, e o `source_hash` sai deste texto: se ele variasse entre
  # leituras, o item seria reenviado à OpenAI sem ter mudado.
  describe "ordem estável" do
    let(:item) do
      build(:product_item, organization: organization, title: "Caneca", custom_fields: { "cor" => "Azul", "material" => "Barro" })
    end

    it "não depende da ordem das categorias" do
      one = described_class.new(item, field_definitions: [], categories: [ [ "casa", "Casa" ], [ "presentes", "Presentes" ] ])
      other = described_class.new(item, field_definitions: [], categories: [ [ "presentes", "Presentes" ], [ "casa", "Casa" ] ])

      expect(one.secondary).to eq(other.secondary)
      expect(one.embedding_text).to eq(other.embedding_text)
    end

    it "não depende da ordem dos campos" do
      one = described_class.new(item, field_definitions: %w[cor material], categories: [])
      other = described_class.new(item, field_definitions: %w[material cor], categories: [])

      expect(one.secondary).to eq(other.secondary)
      expect(one.embedding_text).to eq(other.embedding_text)
    end
  end

  describe "categorias" do
    it "lê do banco quando o item já existe" do
      item = create(:product_item, organization: organization, title: "Cadeira")
      item.sync_categories([ create(:product_category, organization: organization, name: "Móveis").id ])

      expect(described_class.new(item.reload).embedding_text).to include("Móveis")
    end

    it "item novo ainda não tem" do
      item = build(:product_item, organization: organization, title: "Cadeira")

      expect(described_class.new(item).embedding_text).to eq("Cadeira")
    end
  end
end
