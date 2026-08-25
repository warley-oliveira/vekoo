require "rails_helper"

RSpec.describe "Pastas", type: :request do
  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }

  it "lista em ordem alfabética com a contagem de carrosséis" do
    zebra = create(:folder, organization: organization, name: "Zebra")
    alfa = create(:folder, organization: organization, name: "Alfa")
    create(:carousel, organization: organization, folder: alfa)
    create(:carousel, :trashed, organization: organization, folder: alfa)

    get "/folders", headers: headers

    expect(json["folders"].map { |f| f["id"] }).to eq([ alfa.id, zebra.id ])
    # Só conta o que está fora da lixeira.
    expect(json["folders"].first["carouselCount"]).to eq(1)
  end

  it "cria uma pasta" do
    post "/folders",
      params: { folder: { name: "Clientes", color: "oklch(0.62 0.12 292)" } },
      headers: headers, as: :json

    expect(response).to have_http_status(:created)
    expect(json).to include("name" => "Clientes", "color" => "oklch(0.62 0.12 292)")
  end

  it "recusa pasta sem nome" do
    post "/folders", params: { folder: { name: " ", color: "oklch(0.62 0.12 292)" } }, headers: headers, as: :json

    expect(response).to have_http_status(:unprocessable_content)
    expect(json["error"]["details"]).to have_key("name")
  end

  it "renomeia" do
    folder = create(:folder, organization: organization)

    patch "/folders/#{folder.id}", params: { folder: { name: "Outro nome" } }, headers: headers, as: :json

    expect(json["name"]).to eq("Outro nome")
  end

  it "apagar a pasta não apaga o que está dentro" do
    folder = create(:folder, organization: organization)
    carousel = create(:carousel, organization: organization, folder: folder)

    delete "/folders/#{folder.id}", headers: headers

    expect(response).to have_http_status(:no_content)
    expect(carousel.reload.folder_id).to be_nil
  end

  it "não alcança pasta de outra organização" do
    delete "/folders/#{create(:folder).id}", headers: headers

    expect(response).to have_http_status(:not_found)
  end
end
