require "rails_helper"

RSpec.describe "Products: campos personalizados", type: :request do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:headers) { auth_headers(account) }

  def definition(**attributes)
    create(:product_field_definition, { organization: organization, name: "Cor" }.merge(attributes))
  end

  describe "sessão e permissão" do
    [
      [ :get, "/products/field-definitions" ],
      [ :post, "/products/field-definitions" ],
      [ :patch, "/products/field-definitions/qualquer" ],
      [ :delete, "/products/field-definitions/qualquer" ]
    ].each do |verb, path|
      it "#{verb.upcase} #{path} exige sessão" do
        public_send(verb, path, as: :json)

        expect(response).to have_http_status(:unauthorized)
      end

      it "#{verb.upcase} #{path} exige o recurso catalog" do
        role = create(:access_role, organization: organization, permissions: AccessRole::KEYS.index_with("none"))
        member = create(:account, organization: organization, role: "member", access_role: role)

        public_send(verb, path, headers: auth_headers(member), as: :json)

        expect(response).to have_http_status(:forbidden)
      end
    end
  end

  describe "GET /products/field-definitions" do
    it "devolve os campos e os tipos aceitos" do
      field = definition(description: "Cor principal", position: 2)

      get "/products/field-definitions", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["meta"]).to eq("total" => 1)
      expect(json["valueTypes"]).to eq(Products::FieldDefinition::VALUE_TYPES)
      expect(json["fieldDefinitions"].first).to include(
        "id" => field.id, "name" => "Cor", "key" => "cor", "description" => "Cor principal", "valueType" => "text",
        "optionValues" => [], "defaultValue" => nil, "required" => false, "searchable" => true, "position" => 2
      )
    end

    it "não devolve campo de outra organização" do
      create(:product_field_definition, name: "Alheio")

      get "/products/field-definitions", headers: headers

      expect(json["fieldDefinitions"]).to eq([])
    end
  end

  describe "POST /products/field-definitions" do
    it "cria e deriva a chave do nome, com o payload em camelCase" do
      post "/products/field-definitions",
        params: { fieldDefinition: { name: "Preço de Venda", valueType: "number", searchable: false, required: true, defaultValue: "0" } },
        headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json).to include("key" => "preco_de_venda", "valueType" => "number", "searchable" => false, "required" => true, "defaultValue" => "0")
    end

    it "aceita lista com as opções" do
      post "/products/field-definitions",
        params: { fieldDefinition: { name: "Cor", valueType: "list", optionValues: %w[Preto Branco] } },
        headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["optionValues"]).to eq(%w[Preto Branco])
    end

    it "422 para lista sem opções" do
      post "/products/field-definitions",
        params: { fieldDefinition: { name: "Cor", valueType: "list" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "details")).to have_key("optionValues")
      expect(json.dig("error", "field")).to eq("optionValues")
    end

    it "422 para tipo desconhecido" do
      post "/products/field-definitions",
        params: { fieldDefinition: { name: "Qualquer", valueType: "foguete" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("valueType")
    end

    it "422 no campo de nome para nome repetido" do
      definition

      post "/products/field-definitions",
        params: { fieldDefinition: { name: "cor", valueType: "text" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("name")
    end

    it "422 sem nome" do
      post "/products/field-definitions",
        params: { fieldDefinition: { name: "", valueType: "text" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("name")
    end

    it "não deixa o cliente escolher a chave" do
      post "/products/field-definitions",
        params: { fieldDefinition: { name: "Cor", valueType: "text", key: "outra" } }, headers: headers, as: :json

      expect(json["key"]).to eq("cor")
    end

    it "nasce na organização da sessão" do
      post "/products/field-definitions",
        params: { fieldDefinition: { name: "Cor", valueType: "text", organizationId: create(:organization).id } },
        headers: headers, as: :json

      expect(Products::FieldDefinition.find(json["id"]).organization).to eq(organization)
    end

    it "fala no idioma da requisição" do
      post "/products/field-definitions",
        params: { fieldDefinition: { name: "", valueType: "text" } },
        headers: headers.merge("Accept-Language" => "en"), as: :json

      expect(json.dig("error", "message")).to eq("name can't be blank")
    end
  end

  describe "PATCH /products/field-definitions/:id" do
    # Fluxo do campo de lista na tela do item: a pessoa digita um valor que não existe e
    # o cadastra ali mesmo. O PATCH tem de ANEXAR, nunca substituir.
    it "acrescenta uma opção sem perder as que existem" do
      field = definition(value_type: "list", option_values: %w[Preto Branco])

      patch "/products/field-definitions/#{field.id}",
        params: { fieldDefinition: { name: "Cor", valueType: "list", optionValues: %w[Preto Branco Azul] } },
        headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(field.reload.option_values).to eq(%w[Preto Branco Azul])
    end

    it "limpa opções em branco e repetidas na entrada" do
      field = definition(value_type: "list", option_values: %w[Preto])

      patch "/products/field-definitions/#{field.id}",
        params: { fieldDefinition: { optionValues: [ "Preto", "", "  Azul  ", "Azul" ] } }, headers: headers, as: :json

      expect(field.reload.option_values).to eq(%w[Preto Azul])
    end

    # A chave está dentro do jsonb de todo item: renomeá-la deixaria os valores órfãos.
    it "nunca muda a chave, mesmo que ela venha" do
      field = definition

      patch "/products/field-definitions/#{field.id}",
        params: { fieldDefinition: { name: "Cor Principal", key: "outra_chave" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(field.reload).to have_attributes(key: "cor", name: "Cor Principal")
    end

    it "404 em campo de outra organização" do
      foreign = create(:product_field_definition, name: "Alheio")

      patch "/products/field-definitions/#{foreign.id}",
        params: { fieldDefinition: { name: "x" } }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(foreign.reload.name).to eq("Alheio")
    end

    it "422 quando inválido" do
      field = definition

      patch "/products/field-definitions/#{field.id}",
        params: { fieldDefinition: { valueType: "foguete" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(field.reload.value_type).to eq("text")
    end
  end

  describe "DELETE /products/field-definitions/:id" do
    it "204, e os valores já preenchidos continuam nos itens" do
      field = definition
      item = create(:product_item, organization: organization, custom_fields: { "cor" => "Azul" })

      delete "/products/field-definitions/#{field.id}", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(Products::FieldDefinition.exists?(field.id)).to be(false)
      expect(item.reload.custom_fields).to eq("cor" => "Azul")
    end

    it "404 em campo de outra organização" do
      foreign = create(:product_field_definition)

      delete "/products/field-definitions/#{foreign.id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(Products::FieldDefinition.exists?(foreign.id)).to be(true)
    end
  end
end
