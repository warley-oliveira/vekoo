require "rails_helper"

RSpec.describe "Ativos da marca", type: :request do
  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }
  let(:brand) { create(:brand_core, organization: organization) }

  def upload(name, type) = fixture_file_upload(name, type)

  describe "POST /brand-core/assets" do
    it "guarda o logo e diz que o fundo é transparente de verdade" do
      expect {
        post "/brands/#{brand.id}/assets",
          params: { file: upload("logo-transparente.png", "image/png"), kind: "logo", variant: "light" },
          headers: headers
      }.to change(BrandAsset, :count).by(1)

      expect(response).to have_http_status(:created)
      expect(json).to include("kind" => "logo", "variant" => "light", "transparent" => true, "width" => 24, "height" => 16)
      expect(json["url"]).to start_with("/rails/active_storage/blobs/proxy/")
    end

    it "alerta quando o PNG tem canal alfa mas o fundo é opaco" do
      post "/brands/#{brand.id}/assets",
        params: { file: upload("logo-opaco.png", "image/png"), kind: "glyph", variant: "dark" },
        headers: headers

      expect(response).to have_http_status(:created)
      expect(json["transparent"]).to be(false)
    end

    it "conta o logo na completude" do
      post "/brands/#{brand.id}/assets",
        params: { file: upload("logo-transparente.png", "image/png"), kind: "logo", variant: "light" },
        headers: headers
      get "/brands/#{brand.id}", headers: headers

      expect(json["completeness"]["sections"]["assets"]).to eq(100)
      expect(json["assets"].length).to eq(1)
    end

    it "reconhece a fonte pela assinatura do arquivo, não pelo tipo que o navegador manda" do
      post "/brands/#{brand.id}/assets",
        params: { file: upload("fonte.woff2", "application/octet-stream"), kind: "font", variant: "display" },
        headers: headers

      expect(response).to have_http_status(:created)
      expect(json["contentType"]).to eq("font/woff2")
      expect(json["transparent"]).to be_nil
    end

    it "recusa o que não serve para aquele tipo, apontando o campo" do
      post "/brands/#{brand.id}/assets",
        params: { file: upload("documento.txt", "text/plain"), kind: "logo", variant: "light" },
        headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("file")
      expect(json.dig("error", "message")).to match(/PNG/)
    end

    it "recusa um tipo de ativo que não existe" do
      post "/brands/#{brand.id}/assets",
        params: { file: upload("logo-transparente.png", "image/png"), kind: "banner" },
        headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("kind")
    end

    it "exige a versão clara/escura do logo" do
      post "/brands/#{brand.id}/assets",
        params: { file: upload("logo-transparente.png", "image/png"), kind: "logo" },
        headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("variant")
    end

    it "avisa as outras abas" do
      expect {
        post "/brands/#{brand.id}/assets",
          params: { file: upload("logo-transparente.png", "image/png"), kind: "photo" },
          headers: headers
      }.to have_broadcasted_to(organization).from_channel(BrandCoreChannel)
        .with(hash_including("event" => "assetsChanged"))
    end
  end

  describe "DELETE /brand-core/assets/:id" do
    it "apaga o ativo da própria organização" do
      asset = create(:brand_asset, brand_core: brand)

      expect { delete "/brands/#{brand.id}/assets/#{asset.id}", headers: headers }
        .to change(BrandAsset, :count).by(-1)
      expect(response).to have_http_status(:no_content)
    end

    it "não alcança o ativo de outra organização" do
      asset = create(:brand_asset)

      delete "/brands/#{brand.id}/assets/#{asset.id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(BrandAsset.where(id: asset.id)).to exist
    end
  end
end
