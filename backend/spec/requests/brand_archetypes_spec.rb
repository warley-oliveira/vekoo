require "rails_helper"

# Nicho e arquétipos moram no documento do Brandcore, e não em coluna, para
# passar pelo mesmo caminho de qualquer dado da marca: rascunho → publicação
# → versão com o que mudou → restauração. A geração (e, depois, a recuperação
# de referências) lê só o publicado.
RSpec.describe "Nicho e arquétipos da marca", type: :request do
  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }

  def save_identity(brand, identity)
    patch "/brands/#{brand.id}", headers: headers, as: :json, params: {
      brand: { document: { identity: brand.full_document["identity"].merge(identity) } }
    }
  end

  it "salva no rascunho, normalizado, sem tocar a publicação" do
    brand = create(:brand_core, :published, organization: organization)

    save_identity(brand, niche: "food_beverage", archetypes: { primary: "natural_artisanal", secondary: "natural_artisanal" })

    expect(response).to have_http_status(:ok)
    expect(json.dig("document", "identity", "niche")).to eq("food_beverage")
    expect(json.dig("document", "identity", "archetypes")).to eq("primary" => "natural_artisanal", "secondary" => "")
    expect(json.dig("publishedDocument", "identity", "niche")).to eq("")
    expect(json["hasUnpublishedChanges"]).to be(true)
  end

  it "recusa em silêncio o código que a taxonomia não tem" do
    brand = create(:brand_core, :published, organization: organization)

    save_identity(brand, niche: "padaria", archetypes: { primary: "rústico", secondary: "bold_energetic" })

    expect(json.dig("document", "identity", "niche")).to eq("")
    expect(json.dig("document", "identity", "archetypes")).to eq("primary" => "bold_energetic", "secondary" => "")
  end

  it "não acusa mudança pendente em marca publicada antes de os campos existirem" do
    brand = create(:brand_core, :published, organization: organization)
    expect(brand.published_document["identity"]).not_to have_key("niche")

    get "/brands/#{brand.id}", headers: headers

    expect(json["hasUnpublishedChanges"]).to be(false)
    expect(json.dig("publishedDocument", "identity", "archetypes")).to eq("primary" => "", "secondary" => "")
  end

  it "publica como versão nova, com o que mudou no histórico" do
    brand = create(:brand_core, :published, organization: organization)
    save_identity(brand, niche: "food_beverage", archetypes: { primary: "natural_artisanal", secondary: "popular_warm" })

    expect { post "/brands/#{brand.id}/publish", headers: headers }.to change(BrandCoreVersion, :count).by(1)

    expect(json["currentVersion"]).to eq(2)
    expect(json.dig("publishedDocument", "identity", "niche")).to eq("food_beverage")
    version = brand.versions.first
    expect(version.snapshot.dig("identity", "archetypes")).to eq("primary" => "natural_artisanal", "secondary" => "popular_warm")
    expect(version.change_list).to include(
      { "section" => "identity", "path" => "identity.niche", "kind" => "changed" },
      { "section" => "identity", "path" => "identity.archetypes.primary", "kind" => "changed" },
      { "section" => "identity", "path" => "identity.archetypes.secondary", "kind" => "changed" }
    )
    expect(brand.reload.generation_contract[:document].dig("identity", "niche")).to eq("food_beverage")
  end

  it "volta ao rascunho de uma versão anterior pela restauração" do
    brand = create(:brand_core, :complete, organization: organization)
    save_identity(brand, archetypes: { primary: "premium_minimal" })
    post "/brands/#{brand.id}/publish", headers: headers
    save_identity(brand.reload, archetypes: { primary: "young_irreverent" })
    post "/brands/#{brand.id}/publish", headers: headers

    first = brand.versions.find_by!(number: 1)
    post "/brands/#{brand.id}/versions/#{first.id}/restore", headers: headers

    expect(json.dig("document", "identity", "archetypes", "primary")).to eq("premium_minimal")
    expect(json.dig("publishedDocument", "identity", "archetypes", "primary")).to eq("young_irreverent")
  end
end
