require "rails_helper"

# O texto que o embedding lê: o padrão, nunca a fonte.
RSpec.describe References::CardText do
  let(:card) { build(:reference_card, :analyzed) }
  let(:text) { described_class.call(card) }

  it "leva o princípio transferível e o mecanismo" do
    expect(text).to include("Princípio: Mostrar o processo em etapas concretas", "Por que funciona: Transforma o processo")
  end

  it "deixa de fora o quando-não-usar — ele vai na ficha do agente" do
    expect(text).not_to include("Marca sem processo próprio")
  end

  it "descreve a taxonomia pelo sentido, não pelo código" do
    expect(text).to include("Nicho: bares, restaurantes", "Formato: várias lâminas")
    expect(text).not_to include("food_beverage")
  end

  it "nunca leva a fonte" do
    expect(text).not_to include("padariaexemplo", "instagram.com", "C0deExempl0")
  end
end
