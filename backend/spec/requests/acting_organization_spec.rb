require "rails_helper"

# Staff entra na organização interna (as marcas de teste) sem trocar de
# conta; quem não é staff nem vê a rota.
RSpec.describe "Organização em que a sessão age", type: :request do
  let(:staff) { create(:account, staff: true) }
  let(:internal) { create(:organization, name: "Vekoo · teste de referências", internal: true) }
  let!(:test_brand) { create(:brand_core, :published, organization: internal) }
  let!(:own_brand) { create(:brand_core, :published, organization: staff.organization) }
  let(:session) { Session.start!(staff) }
  let(:headers) { { "Authorization" => "Bearer #{session.token}" } }

  def switch(id) = patch("/me/organization", params: { organizationId: id }, headers: headers, as: :json)

  it "staff vê para onde pode ir, entra na interna, enxerga as marcas dela e volta" do
    get "/me", headers: headers
    expect(json["organizations"].map { |org| org["id"] }).to eq([ staff.organization_id, internal.id ])
    expect(json["organization"]["id"]).to eq(staff.organization_id)

    switch(internal.id)
    expect(response).to have_http_status(:ok)
    expect(json["organization"]).to include("id" => internal.id, "internal" => true)

    get "/brands", headers: headers
    expect(json["brands"].map { |brand| brand["id"] }).to eq([ test_brand.id ])

    switch(nil)
    get "/brands", headers: headers
    expect(json["brands"].map { |brand| brand["id"] }).to eq([ own_brand.id ])
  end

  it "organização de cliente (não interna) é recusada" do
    other = create(:organization)

    switch(other.id)

    expect(response).to have_http_status(:unprocessable_entity)
    expect(session.reload.acting_organization).to be_nil
  end

  it "quem não é staff recebe 404 e não tem lista de organizações" do
    customer = create(:account)
    customer_headers = auth_headers(customer)

    patch "/me/organization", params: { organizationId: internal.id }, headers: customer_headers, as: :json
    expect(response).to have_http_status(:not_found)

    get "/me", headers: customer_headers
    expect(json).not_to have_key("organizations")
  end

  it "deixou de ser staff: a sessão volta à organização da conta" do
    switch(internal.id)
    staff.update!(staff: false)

    get "/brands", headers: headers

    expect(json["brands"].map { |brand| brand["id"] }).to eq([ own_brand.id ])
  end
end
