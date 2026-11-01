require "rails_helper"

# O nicho que a geração usa sai da marca **publicada**: o campo, se ela já o
# publicou; senão, a dedução sobre o que ela publicou. O rascunho nunca conta.
RSpec.describe BrandCore, "#generation_niche" do
  # Publicada com esta identidade, rascunho igual à publicação.
  def published_with(identity)
    create(:brand_core, :published).tap do |brand|
      document = brand.published_document.deep_merge("identity" => identity)
      brand.update!(document: document, published_document: document)
    end
  end

  it "usa o nicho publicado" do
    brand = published_with("niche" => "pet", "segment" => "Imobiliária")

    expect(brand.generation_niche).to eq("pet")
  end

  it "deduz do que a marca publicou quando ela é de antes do campo" do
    brand = published_with("segment" => "Imobiliária de alto padrão")

    expect(brand.generation_niche).to eq("real_estate")
  end

  it "usa o código do ramo do onboarding na dedução" do
    brand = published_with("segment" => "Comida caseira")
    brand.track_onboarding(segment: "restaurant")

    expect(brand.generation_niche).to eq("food_beverage")
  end

  it "ignora o rascunho" do
    brand = published_with("segment" => "Loja")
    brand.assign_section("identity", brand.full_document["identity"].merge("niche" => "pet"))
    brand.save!

    expect(brand.generation_niche).to be_nil
  end

  it "não existe para marca que nunca publicou" do
    expect(create(:brand_core, :complete).generation_niche).to be_nil
  end

  it "não escreve nada na marca" do
    brand = published_with("segment" => "Imobiliária")

    expect { brand.generation_niche }.not_to change { brand.reload.attributes }
    expect(brand.unpublished_changes?).to be(false)
  end
end
