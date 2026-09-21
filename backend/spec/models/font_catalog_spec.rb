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
end
