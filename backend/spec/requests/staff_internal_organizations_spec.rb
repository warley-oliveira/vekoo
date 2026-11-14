require "rails_helper"

# Staff (`User#staff`) entra nas organizações internas da Vekoo (as marcas de teste da curadoria)
# pela mesma lista do suporte: um vínculo de suporte por organização, levado no `X-Account` como
# qualquer outro. Organização de cliente continua fora do alcance dele.
RSpec.describe "Staff nas organizações internas", type: :request do
  let(:staff) { create(:account, :staff) }
  let(:internal) { create(:organization, name: "Vekoo · teste de referências", internal: true) }
  let!(:test_brand) { create(:brand_core, :published, organization: internal) }
  let!(:own_brand) { create(:brand_core, :published, organization: staff.organization) }
  let(:headers) { auth_headers(staff.user) }

  it "lista só as internas, entra numa e enxerga as marcas dela pelo vínculo de suporte" do
    create(:organization, name: "Clínica de cliente")

    get "/support/organizations", headers: headers
    expect(json["organizations"].map { |org| org["id"] }).to eq([ internal.id ])

    post "/support/organizations/#{internal.id}/enter", headers: headers
    expect(response).to have_http_status(:created)
    hashid = json["hashid"]
    expect(json).to include("support" => true)

    get "/brands", headers: headers.merge("X-Account" => hashid)
    expect(json["brands"].map { |brand| brand["id"] }).to eq([ test_brand.id ])

    get "/brands", headers: headers.merge("X-Account" => staff.hashid)
    expect(json["brands"].map { |brand| brand["id"] }).to eq([ own_brand.id ])
  end

  it "organização de cliente é 404" do
    other = create(:organization)

    post "/support/organizations/#{other.id}/enter", headers: headers

    expect(response).to have_http_status(:not_found)
    expect(Account.where(user: staff.user, organization: other)).not_to exist
  end

  it "quem não é staff nem suporte recebe 404 na lista" do
    get "/support/organizations", headers: auth_headers(create(:account))

    expect(response).to have_http_status(:not_found)
  end

  it "deixou de ser staff: o vínculo de suporte da interna para de valer" do
    post "/support/organizations/#{internal.id}/enter", headers: headers
    hashid = json["hashid"]

    staff.user.update!(staff: false)
    get "/brands", headers: headers.merge("X-Account" => hashid)

    expect(response).to have_http_status(:not_found)
  end

  it "o /me conta que a pessoa é staff" do
    get "/me", headers: auth_headers(staff)

    expect(json.dig("user", "staff")).to be(true)
    expect(json).not_to have_key("organizations")
  end
end
