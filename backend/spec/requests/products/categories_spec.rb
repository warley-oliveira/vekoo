require "rails_helper"

RSpec.describe "Products: categorias", type: :request do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:headers) { auth_headers(account) }

  def category(name, parent: nil)
    create(:product_category, organization: organization, name: name, parent: parent)
  end

  describe "sessão e permissão" do
    [
      [ :get, "/products/categories" ],
      [ :post, "/products/categories" ],
      [ :patch, "/products/categories/qualquer" ],
      [ :delete, "/products/categories/qualquer" ]
    ].each do |verb, path|
      it "#{verb.upcase} #{path} exige sessão" do
        public_send(verb, path, as: :json)

        expect(response).to have_http_status(:unauthorized)
      end

      it "#{verb.upcase} #{path} exige o recurso catalog" do
        role = create(:access_role, organization: organization, permissions: AccessRole::BLANK_PERMISSIONS)
        member = create(:account, organization: organization, role: "member", access_role: role)

        public_send(verb, path, headers: auth_headers(member), as: :json)

        expect(response).to have_http_status(:forbidden)
      end
    end
  end

  describe "GET /products/categories" do
    it "devolve a árvore plana, com filho logo depois do pai" do
      moda = category("Moda")
      category("Moda Praia")
      child = category("Camisetas", parent: moda)
      child.update_columns(items_count: 4)

      get "/products/categories", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["categories"].map { |entry| entry["name"] }).to eq([ "Moda", "Camisetas", "Moda Praia" ])
      expect(json["categories"].second).to include(
        "id" => child.id, "slug" => "camisetas", "path" => "moda/camisetas", "parentId" => moda.id,
        "depth" => 1, "itemsCount" => 4, "position" => 0
      )
      expect(json["meta"]).to eq("total" => 3)
    end

    it "respeita a posição entre irmãos" do
      create(:product_category, organization: organization, name: "Zebra", position: 0)
      create(:product_category, organization: organization, name: "Alfa", position: 1)

      get "/products/categories", headers: headers

      expect(json["categories"].map { |entry| entry["name"] }).to eq(%w[Zebra Alfa])
    end

    it "não devolve categoria de outra organização" do
      create(:product_category, name: "Alheia")

      get "/products/categories", headers: headers

      expect(json["categories"]).to eq([])
    end
  end

  describe "POST /products/categories" do
    it "cria na raiz" do
      post "/products/categories", params: { category: { name: "Moda" } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json).to include("name" => "Moda", "path" => "moda", "parentId" => nil, "depth" => 0, "itemsCount" => 0)
      expect(Products::Category.find(json["id"]).organization).to eq(organization)
    end

    it "cria dentro de outra, com o payload em camelCase" do
      moda = category("Moda")

      post "/products/categories", params: { category: { name: "Vestidos", parentId: moda.id } }, headers: headers, as: :json

      expect(json).to include("path" => "moda/vestidos", "parentId" => moda.id, "depth" => 1)
    end

    it "422 sem nome" do
      post "/products/categories", params: { category: { name: "" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json["error"]).to include("code" => "unprocessable", "field" => "name")
      expect(json.dig("error", "details").keys).to eq([ "name" ])
    end

    it "422 no campo de nome para nome repetido no mesmo nível" do
      category("Moda")

      post "/products/categories", params: { category: { name: "moda" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("name")
    end

    # Um pai de outra organização seria vazamento de escopo.
    it "422, sem criar nada, para pai de outra organização" do
      foreign = create(:product_category)

      expect {
        post "/products/categories", params: { category: { name: "x", parentId: foreign.id } }, headers: headers, as: :json
      }.not_to change(Products::Category, :count)

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("parentId")
    end

    it "responde igual para pai que não existe, sem revelar o que é de outra organização" do
      post "/products/categories", params: { category: { name: "x", parentId: SecureRandom.uuid } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("parentId")
    end

    it "fala no idioma da requisição" do
      post "/products/categories", params: { category: { name: "" } }, headers: headers.merge("Accept-Language" => "en"), as: :json

      expect(json.dig("error", "message")).to eq("name can't be blank")
    end

    it "400, e não 500, com envelope que não é objeto" do
      post "/products/categories", params: { category: "x" }, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
    end
  end

  describe "PATCH /products/categories/:id" do
    it "renomeia, levando a subárvore" do
      moda = category("Moda")
      child = category("Camisetas", parent: moda)

      patch "/products/categories/#{moda.id}", params: { category: { name: "Roupas" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("name" => "Roupas", "path" => "roupas")
      expect(child.reload.path).to eq("roupas/camisetas")
    end

    it "volta para a raiz com `parentId` nulo" do
      moda = category("Moda")
      child = category("Camisetas", parent: moda)

      patch "/products/categories/#{child.id}", params: { category: { parentId: nil } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("path" => "camisetas", "parentId" => nil, "depth" => 0)
    end

    it "422 ao virar filha de si mesma ou de um descendente" do
      moda = category("Moda")
      child = category("Camisetas", parent: moda)

      patch "/products/categories/#{moda.id}", params: { category: { parentId: moda.id } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("parentId")

      patch "/products/categories/#{moda.id}", params: { category: { parentId: child.id } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
      expect(moda.reload.parent_id).to be_nil
    end

    it "404 em categoria de outra organização" do
      foreign = create(:product_category, name: "Alheia")

      patch "/products/categories/#{foreign.id}", params: { category: { name: "x" } }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(foreign.reload.name).to eq("Alheia")
    end
  end

  describe "DELETE /products/categories/:id" do
    it "leva a subárvore e os vínculos; os itens continuam" do
      moda = category("Moda")
      child = category("Camisetas", parent: moda)
      item = create(:product_item, organization: organization)
      item.sync_categories([ child.id ])

      delete "/products/categories/#{moda.id}", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(Products::Category.for_organization(organization.id).count).to eq(0)
      expect(Products::Item.exists?(item.id)).to be(true)
    end

    it "404 em categoria de outra organização" do
      foreign = create(:product_category)

      delete "/products/categories/#{foreign.id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(Products::Category.exists?(foreign.id)).to be(true)
    end
  end
end
