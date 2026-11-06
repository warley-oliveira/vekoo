require "rails_helper"

RSpec.describe "Products: imagens", type: :request do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:headers) { auth_headers(account) }
  let(:item) { create(:product_item, organization: organization) }

  def png = fixture_file_upload("foto.png", "image/png")

  describe "POST /products/items/:item_id/images" do
    it "hospeda a imagem e devolve o que a tela precisa" do
      expect {
        post "/products/items/#{item.id}/images", params: { file: png }, headers: headers
      }.to change(Products::Image, :count).by(1)

      expect(response).to have_http_status(:created)
      expect(json).to include("hosted" => true, "position" => 1, "alt" => nil)
      expect(json["url"]).to start_with("/rails/active_storage/blobs/proxy/")
      expect(json["url"]).to end_with(".png")
      expect(json["thumbUrl"]).to start_with("/rails/active_storage/representations/proxy/")
      expect(json["createdAt"]).to be_a(Integer)
    end

    it "põe a nova depois das que já existem" do
      create(:product_image, item: item, position: 5)

      post "/products/items/#{item.id}/images", params: { file: png }, headers: headers

      expect(json["position"]).to eq(6)
    end

    it "serve a imagem de verdade pela rota devolvida" do
      post "/products/items/#{item.id}/images", params: { file: png }, headers: headers

      get json["url"]

      expect(response).to have_http_status(:ok)
      expect(response.media_type).to eq("image/png")
    end

    it "gera a miniatura pela rota devolvida" do
      post "/products/items/#{item.id}/images", params: { file: png }, headers: headers

      get json["thumbUrl"]

      expect(response).to have_http_status(:ok)
      expect(response.media_type).to eq("image/webp")
    end

    it "recusa o que não é imagem, apontando o campo" do
      expect {
        post "/products/items/#{item.id}/images",
          params: { file: fixture_file_upload("documento.txt", "text/plain") }, headers: headers
      }.not_to change(Products::Image, :count)

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json["error"]).to include("code" => "unprocessable", "field" => "file")
      expect(json.dig("error", "details", "file")).to be_present
    end

    it "recusa arquivo acima do teto" do
      stub_const("Products::Image::MAX_BYTES", 10)

      post "/products/items/#{item.id}/images", params: { file: png }, headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("file")
    end

    it "fala no idioma da requisição" do
      post "/products/items/#{item.id}/images",
        params: { file: fixture_file_upload("documento.txt", "text/plain") },
        headers: headers.merge("Accept-Language" => "en")

      expect(json.dig("error", "message")).to match(/JPEG/)
      expect(json.dig("error", "message")).not_to match(/precisa/)
    end

    it "400 sem arquivo" do
      post "/products/items/#{item.id}/images", headers: headers

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "code")).to eq("parameterMissing")
    end

    it "400 com `file` em texto" do
      post "/products/items/#{item.id}/images", params: { file: "nao-e-arquivo" }, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
    end

    it "401 sem sessão" do
      post "/products/items/#{item.id}/images", params: { file: png }

      expect(response).to have_http_status(:unauthorized)
    end

    it "403 sem o recurso catalog" do
      role = create(:access_role, organization: organization, permissions: AccessRole::KEYS.index_with("none"))
      member = create(:account, organization: organization, role: "member", access_role: role)

      post "/products/items/#{item.id}/images", params: { file: png }, headers: auth_headers(member)

      expect(response).to have_http_status(:forbidden)
    end

    it "404 em item de outra organização" do
      foreign = create(:product_item)

      expect {
        post "/products/items/#{foreign.id}/images", params: { file: png }, headers: headers
      }.not_to change(Products::Image, :count)

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "PATCH /products/images/:id" do
    let(:image) { create(:product_image, item: item, source_url: "https://ex.com/a.png") }

    it "atualiza posição e texto alternativo" do
      patch "/products/images/#{image.id}", params: { image: { position: 3, alt: "Camiseta azul" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("position" => 3, "alt" => "Camiseta azul", "url" => "https://ex.com/a.png", "hosted" => false)
    end

    it "422, e não 500, para posição que não cabe na coluna" do
      patch "/products/images/#{image.id}", params: { image: { position: 99_999_999_999 } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("position")
    end

    it "400, e não 500, com envelope que não é objeto" do
      patch "/products/images/#{image.id}", params: { image: "x" }, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
    end

    it "não muda o endereço de origem" do
      patch "/products/images/#{image.id}", params: { image: { sourceUrl: "https://mal.com/x.png" } }, headers: headers, as: :json

      expect(image.reload.source_url).to eq("https://ex.com/a.png")
    end

    it "404 em imagem de outra organização" do
      foreign = create(:product_image)

      patch "/products/images/#{foreign.id}", params: { image: { position: 3 } }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(foreign.reload.position).to eq(0)
    end

    it "401 sem sessão" do
      patch "/products/images/#{image.id}", params: { image: { position: 3 } }, as: :json

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "DELETE /products/images/:id" do
    it "204 e some" do
      image = create(:product_image, item: item)

      delete "/products/images/#{image.id}", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(Products::Image.exists?(image.id)).to be(false)
    end

    it "404 em imagem de outra organização" do
      foreign = create(:product_image)

      delete "/products/images/#{foreign.id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(Products::Image.exists?(foreign.id)).to be(true)
    end
  end

  describe "imagens dentro do item" do
    it "saem na ordem da posição, com a principal primeiro" do
      second = create(:product_image, item: item, position: 2)
      first = create(:product_image, item: item, position: 1)

      get "/products/items/#{item.id}", headers: headers

      expect(json["images"].map { |image| image["id"] }).to eq([ first.id, second.id ])
    end
  end
end
