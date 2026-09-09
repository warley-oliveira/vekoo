require "rails_helper"

# A migração do legado: carrosséis e pastas de antes de existir marca.
RSpec.describe "Órfãos", type: :request do
  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }
  let!(:brand) { create(:brand_core, :published, organization: organization) }

  def orphan_carousel(org = organization, title: "Antigo")
    carousel = build(:carousel, organization: org, brand_core: org.brand_cores.first, title: title)
    carousel.save!
    carousel.update_column(:brand_core_id, nil)
    carousel
  end

  it "lista os órfãos e as marcas que podem recebê-los" do
    old = orphan_carousel
    create(:carousel, organization: organization, brand_core: brand)
    folder = create(:folder, organization: organization, brand_core: brand)
    folder.update_column(:brand_core_id, nil)

    get "/orphans", headers: headers

    expect(response).to have_http_status(:ok)
    expect(json["counts"]).to eq("carousels" => 1, "folders" => 1)
    expect(json["carousels"].map { |c| c["id"] }).to eq([ old.id ])
    expect(json["brands"].map { |b| b["id"] }).to eq([ brand.id ])
  end

  it "entrega todos os órfãos (e as pastas) a uma marca da organização" do
    old = orphan_carousel
    folder = create(:folder, organization: organization, brand_core: brand)
    folder.update_column(:brand_core_id, nil)

    post "/orphans/assign", params: { brandId: brand.id }, headers: headers, as: :json

    expect(response).to have_http_status(:ok)
    expect(json["moved"]).to eq(1)
    expect(json["counts"]).to eq("carousels" => 0, "folders" => 0)
    expect(old.reload.brand_core).to eq(brand)
    expect(folder.reload.brand_core).to eq(brand)
  end

  it "entrega só os escolhidos quando a lista vem" do
    a = orphan_carousel(title: "A")
    b = orphan_carousel(title: "B")

    post "/orphans/assign", params: { brandId: brand.id, carouselIds: [ a.id ] }, headers: headers, as: :json

    expect(a.reload.brand_core).to eq(brand)
    expect(b.reload.brand_core).to be_nil
    expect(json["counts"]["carousels"]).to eq(1)
  end

  it "não aceita marca de outra organização" do
    orphan_carousel

    post "/orphans/assign", params: { brandId: create(:brand_core).id }, headers: headers, as: :json

    expect(response).to have_http_status(:not_found)
  end

  it "some quando a migração é desligada" do
    stub_const("ENV", ENV.to_h.merge("ORPHAN_MIGRATION" => "false"))

    get "/orphans", headers: headers

    expect(response).to have_http_status(:not_found)
  end

  it "resolve sozinha quem tem uma marca só (rake brands:migrate_orphans)" do
    old = orphan_carousel
    two_brands = create(:account).organization
    create(:brand_core, organization: two_brands)
    create(:brand_core, organization: two_brands)
    ambiguous = orphan_carousel(two_brands)

    expect(OrphanMigration.migrate_unambiguous!).to eq(1)
    expect(old.reload.brand_core).to eq(brand)
    expect(ambiguous.reload.brand_core).to be_nil
  end
end
