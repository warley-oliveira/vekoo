require "rails_helper"

# O catálogo de fontes vive nos dois lados: aqui (o agente escolhe daqui, e é
# daqui que `BrandFonts` sabe o que baixar) e em `font-catalog.ts` (a tela
# mostra e pré-visualiza). Sair de sincronia significa a IA propor uma fonte
# que a tela não sabe carregar — ou o contrário.
RSpec.describe BrandCore::FontCatalog do
  TS_PATH = Rails.root.join("../frontend/src/lib/font-catalog.ts").freeze

  def typescript_families
    File.read(TS_PATH).scan(/\{\s*family:\s*"([^"]+)"/).flatten
  end

  it "tem exatamente as mesmas famílias do catálogo do front" do
    skip "front não está neste checkout" unless File.exist?(TS_PATH)

    expect(described_class.families).to eq(typescript_families)
  end

  it "aponta o peso publicado mais próximo do pedido" do
    # Bebas Neue só publica 400: pedir 700 não pode devolver 700.
    expect(described_class.nearest_weight("Bebas Neue", 700)).to eq(400)
    expect(described_class.nearest_weight("Inter", 700)).to eq(700)
  end

  it "agrupa por categoria para o agente escolher com critério" do
    expect(described_class.as_prompt.keys).to match_array(described_class::CATEGORIES)
  end

  it "toda fonte da vitrine existe no índice do Google Fonts" do
    missing = described_class.families.reject { |family| BrandCore::FontDirectory.exists?(family) }
    expect(missing).to be_empty
  end

  it "resolve qualquer família aberta, com os pesos que ela publica" do
    expect(described_class.resolve("Libre Caslon Text").weights).to eq([ 400, 700 ])
    expect(described_class.nearest_weight("Libre Caslon Text", 600)).to eq(700)
    expect(described_class.resolve("Gotham")).to be_nil
  end
end

RSpec.describe BrandCore::FontDirectory do
  FRONT_DIRECTORY = Rails.root.join("../frontend/src/lib/google-fonts.json").freeze

  it "é o mesmo arquivo do front" do
    skip "front não está neste checkout" unless File.exist?(FRONT_DIRECTORY)

    expect(File.read(FRONT_DIRECTORY)).to eq(File.read(described_class::PATH))
  end

  it "acha sem diferenciar maiúscula nem espaço sobrando" do
    expect(described_class.find("  libre   caslon text ")&.family).to eq("Libre Caslon Text")
  end
end
