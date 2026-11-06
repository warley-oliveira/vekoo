require "rails_helper"

RSpec.describe "Products: itens", type: :request do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:headers) { auth_headers(account) }

  let(:other_organization) { create(:organization) }

  def no_catalog_headers
    role = create(:access_role, organization: organization, permissions: AccessRole::KEYS.index_with("none"))
    auth_headers(create(:account, organization: organization, role: "member", access_role: role))
  end

  describe "sessão e permissão" do
    [
      [ :get, "/products/items" ],
      [ :get, "/products/search" ],
      [ :post, "/products/items" ],
      [ :post, "/products/items/bulk-destroy" ],
      [ :get, "/products/items/qualquer" ],
      [ :patch, "/products/items/qualquer" ],
      [ :delete, "/products/items/qualquer" ]
    ].each do |verb, path|
      it "#{verb.upcase} #{path} exige sessão" do
        public_send(verb, path, as: :json)

        expect(response).to have_http_status(:unauthorized)
        expect(json.dig("error", "code")).to eq("unauthorized")
      end

      it "#{verb.upcase} #{path} exige o recurso catalog" do
        public_send(verb, path, headers: no_catalog_headers, as: :json)

        expect(response).to have_http_status(:forbidden)
        expect(json.dig("error", "code")).to eq("forbidden")
      end
    end

    it "membro comum tem o recurso por padrão" do
      get "/products/items", headers: auth_headers(create(:account, organization: organization, role: "member"))

      expect(response).to have_http_status(:ok)
    end
  end

  describe "GET /products/items" do
    it "devolve os itens e a paginação no formato único" do
      item = create(:product_item, organization: organization, title: "Cadeira", external_id: "A1", tags: %w[gamer])

      get "/products/items", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["items"].first).to include(
        "id" => item.id, "title" => "Cadeira", "externalId" => "A1", "active" => true,
        "tags" => %w[gamer], "customFields" => {}, "images" => [], "updatedAt" => a_kind_of(Integer)
      )
      expect(json["items"].first.keys).not_to include("description", "indexTextPrimary", "searchDocument")
      expect(json["meta"]).to eq("page" => 1, "perPage" => 24, "total" => 1, "totalPages" => 1, "hasMore" => false)
    end

    it "pagina" do
      create_list(:product_item, 3, organization: organization)

      get "/products/items", params: { page: 2, perPage: 2 }, headers: headers

      expect(json["items"].size).to eq(1)
      expect(json["meta"]).to include("page" => 2, "perPage" => 2, "total" => 3, "totalPages" => 2, "hasMore" => false)
    end

    it "ordena por coluna da allowlist" do
      create(:product_item, organization: organization, title: "Bravo")
      create(:product_item, organization: organization, title: "Alfa")

      get "/products/items", params: { sortBy: "title", sortOrder: "asc" }, headers: headers

      expect(json["items"].map { |item| item["title"] }).to eq(%w[Alfa Bravo])

      get "/products/items", params: { sortBy: "title", sortOrder: "desc" }, headers: headers

      expect(json["items"].map { |item| item["title"] }).to eq(%w[Bravo Alfa])
    end

    it "aceita o nome da coluna em camelCase ou snake_case" do
      old = create(:product_item, organization: organization, title: "Antigo", created_at: 2.days.ago)
      recent = create(:product_item, organization: organization, title: "Recente", created_at: 1.day.ago)

      [ "createdAt", "created_at" ].each do |column|
        get "/products/items", params: { sortBy: column, sortOrder: "asc" }, headers: headers

        expect(json["items"].map { |item| item["id"] }).to eq([ old.id, recent.id ])
      end
    end

    # O valor vem do cliente e entra num ORDER BY: fora da allowlist cai no padrão.
    it "ignora ordenação fora da allowlist" do
      create(:product_item, organization: organization)

      get "/products/items", params: { sortBy: "id; DROP TABLE product_items", sortOrder: "sideways" }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["items"].size).to eq(1)
    end

    it "não devolve item de outra organização" do
      create(:product_item, organization: other_organization, title: "Alheia")

      get "/products/items", headers: headers

      expect(json["meta"]["total"]).to eq(0)
    end

    it "não leva a uma consulta por linha" do
      3.times { create(:product_image, item: create(:product_item, organization: organization)) }
      queries = []
      subscriber = ActiveSupport::Notifications.subscribe("sql.active_record") do |*, payload|
        queries << payload[:sql] if payload[:sql].match?(/product_images|active_storage_attachments/)
      end

      get "/products/items", headers: headers

      ActiveSupport::Notifications.unsubscribe(subscriber)
      expect(json["items"].size).to eq(3)
      expect(queries.size).to be <= 2
    end

    describe "busca da grade" do
      let!(:shirt) { create(:product_item, organization: organization, title: "Camiseta Básica", summary: "Algodão") }
      let!(:dress) { create(:product_item, organization: organization, title: "Vestido Midi") }

      def titles(**params)
        get "/products/items", params: params, headers: headers
        json["items"].map { |item| item["title"] }
      end

      # A origem mandava `q` da tela e o back-end simplesmente o ignorava.
      it "filtra pelo termo, sem chamar a API de embeddings" do
        with_openai_key("sk-teste") do
          expect(titles(q: "camiset")).to eq([ "Camiseta Básica" ])
          expect(titles(q: "camisetas")).to eq([ "Camiseta Básica" ])
          expect(titles(q: "algodao")).to eq([ "Camiseta Básica" ])
          expect(titles(q: "nada disso")).to eq([])
        end

        expect(a_request(:any, ProductsSpecHelpers::EMBEDDINGS_URL)).not_to have_been_made
      end

      it "conta só o que casa na paginação" do
        get "/products/items", params: { q: "camiseta" }, headers: headers

        expect(json["meta"]["total"]).to eq(1)
      end

      it "respeita a ordenação escolhida" do
        create(:product_item, organization: organization, title: "Camiseta Azul")

        expect(titles(q: "camiseta", sortBy: "title", sortOrder: "desc")).to eq([ "Camiseta Básica", "Camiseta Azul" ])
      end
    end

    describe "filtros" do
      let(:category) { create(:product_category, organization: organization, name: "Moda") }

      it "por tag" do
        create(:product_item, organization: organization, title: "Com", tags: %w[promo])
        create(:product_item, organization: organization, title: "Sem")

        get "/products/items", params: { tags: %w[promo] }, headers: headers

        expect(json["items"].map { |item| item["title"] }).to eq(%w[Com])
      end

      it "por caminho de categoria, com a subárvore" do
        child = create(:product_category, organization: organization, name: "Camisetas", parent: category)
        create(:product_item, organization: organization, title: "Na categoria").sync_categories([ child.id ])
        create(:product_item, organization: organization, title: "Fora")

        get "/products/items", params: { categories: %w[moda] }, headers: headers

        expect(json["items"].map { |item| item["title"] }).to eq([ "Na categoria" ])
      end

      it "por campo personalizado, preservando a chave do campo" do
        create(:product_field_definition, organization: organization, name: "Preço", value_type: "number")
        create(:product_item, organization: organization, title: "Barata", custom_fields: { "preco" => 10 })
        create(:product_item, organization: organization, title: "Cara", custom_fields: { "preco" => 100 })

        get "/products/items", params: { custom: { preco: { max: 50 } } }, headers: headers
        expect(json["items"].map { |item| item["title"] }).to eq(%w[Barata])

        get "/products/items", params: { custom: { preco: "100" } }, headers: headers
        expect(json["items"].map { |item| item["title"] }).to eq(%w[Cara])
      end

      it "ignora `custom` que não é um mapa, sem estourar" do
        create(:product_item, organization: organization)

        get "/products/items", params: { custom: "nada" }, headers: headers

        expect(response).to have_http_status(:ok)
      end

      # A tela de gestão precisa mandar isto, ou o item desativado some sem volta.
      it "esconde os inativos, a não ser que peçam" do
        create(:product_item, organization: organization, title: "Inativo", active: false)

        get "/products/items", headers: headers
        expect(json["items"]).to eq([])

        get "/products/items", params: { includeInactive: "true" }, headers: headers
        expect(json["items"].first).to include("title" => "Inativo", "active" => false)
      end
    end
  end

  describe "GET /products/search" do
    let!(:item) { create(:product_item, organization: organization, title: "Cadeira Gamer", external_id: "A1") }

    context "sem chave da OpenAI" do
      around { |example| with_openai_key(nil) { example.run } }

      it "devolve o resultado ranqueado e a estratégia usada" do
        get "/products/search", params: { q: "cadeiras" }, headers: headers

        expect(response).to have_http_status(:ok)
        expect(json["items"].map { |found| found["id"] }).to eq([ item.id ])
        expect(json["meta"]).to eq("total" => 1, "strategy" => "lexical")
        expect(a_request(:any, ProductsSpecHelpers::EMBEDDINGS_URL)).not_to have_been_made
      end

      it "cai no texto para pedaço de palavra, sem erro" do
        get "/products/search", params: { q: "cadei" }, headers: headers

        expect(response).to have_http_status(:ok)
        expect(json["meta"]["strategy"]).to eq("text")
        expect(json["items"].size).to eq(1)
      end
    end

    context "com chave da OpenAI" do
      around { |example| with_openai_key("sk-teste") { example.run } }

      it "funde o vetor com o texto" do
        sofa = create(:product_item, organization: organization, title: "Sofá Retrátil")
        create(:product_embedding, item: sofa, vector: embedding_vector(0))
        stub_openai_embeddings(axis: 0)

        get "/products/search", params: { q: "algo para relaxar" }, headers: headers

        expect(response).to have_http_status(:ok)
        expect(json["meta"]["strategy"]).to eq("hybrid")
        expect(json["items"].first["id"]).to eq(sofa.id)
      end

      it "responde pelo texto se a API falhar, sem erro" do
        stub_request(:post, ProductsSpecHelpers::EMBEDDINGS_URL).to_return(status: 500, body: "{}")

        get "/products/search", params: { q: "cadeira" }, headers: headers

        expect(response).to have_http_status(:ok)
        expect(json["meta"]["strategy"]).to eq("lexical")
      end
    end

    it "SKU exato tem estratégia própria" do
      get "/products/search", params: { q: "A1" }, headers: headers

      expect(json["meta"]).to eq("total" => 1, "strategy" => "exact")
    end

    it "sem termo, navega" do
      get "/products/search", headers: headers

      expect(json["meta"]["strategy"]).to eq("browse")
    end

    it "aceita limite e filtros" do
      create_list(:product_item, 3, organization: organization, tags: %w[promo])

      get "/products/search", params: { limit: 2, tags: %w[promo] }, headers: headers

      expect(json["items"].size).to eq(2)
      expect(json["meta"]["total"]).to eq(3)
    end

    it "não encontra item de outra organização" do
      create(:product_item, organization: other_organization, title: "Cadeira Alheia", external_id: "ALHEIO")

      get "/products/search", params: { q: "ALHEIO" }, headers: headers
      expect(json["items"]).to eq([])

      get "/products/search", params: { q: "cadeira" }, headers: headers
      expect(json["items"].map { |found| found["title"] }).to eq([ "Cadeira Gamer" ])
    end
  end

  describe "GET /products/items/:id" do
    it "devolve o item completo" do
      category = create(:product_category, organization: organization, name: "Moda")
      item = create(:product_item, organization: organization, description: "Longa")
      item.sync_categories([ category.id ])

      get "/products/items/#{item.id}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json).to include("id" => item.id, "description" => "Longa")
      expect(json["categories"]).to eq([ { "id" => category.id, "name" => "Moda", "path" => "moda" } ])
    end

    it "404 para item de outra organização" do
      item = create(:product_item, organization: other_organization)

      get "/products/items/#{item.id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(json.dig("error", "code")).to eq("notFound")
    end

    it "404 para id que nem é UUID" do
      get "/products/items/123", headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /products/items" do
    it "cria com o payload em camelCase" do
      category = create(:product_category, organization: organization)
      create(:product_field_definition, organization: organization, name: "Preço", value_type: "number")

      expect {
        post "/products/items",
          params: { item: {
            title: "Nova Cadeira", summary: "Resumo", description: "Longa", externalId: "A1", url: "https://loja.com/a",
            active: false, tags: %w[gamer], customFields: { preco: "1.234,50" }, categoryIds: [ category.id ]
          } },
          headers: headers, as: :json
      }.to change(Products::Item, :count).by(1)

      expect(response).to have_http_status(:created)
      expect(json).to include(
        "title" => "Nova Cadeira", "externalId" => "A1", "url" => "https://loja.com/a", "active" => false,
        "description" => "Longa", "customFields" => { "preco" => 1234.5 }
      )
      expect(json["categories"].map { |entry| entry["id"] }).to eq([ category.id ])
    end

    it "nasce na organização da sessão, mesmo que o corpo diga outra" do
      post "/products/items",
        params: { item: { title: "x", organizationId: other_organization.id } }, headers: headers, as: :json

      expect(Products::Item.find(json["id"]).organization).to eq(organization)
    end

    it "nasce achável pela categoria" do
      category = create(:product_category, organization: organization, name: "Escritório")

      post "/products/items", params: { item: { title: "Cadeira", categoryIds: [ category.id ] } }, headers: headers, as: :json

      get "/products/search", params: { q: "escritorio" }, headers: headers
      expect(json["items"].map { |found| found["title"] }).to eq([ "Cadeira" ])
    end

    it "ignora categoria de outra organização" do
      foreign = create(:product_category, organization: other_organization)

      post "/products/items", params: { item: { title: "x", categoryIds: [ foreign.id ] } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["categories"]).to eq([])
      expect(foreign.reload.items_count).to eq(0)
    end

    it "enfileira o embedding com chave, e não enfileira sem" do
      with_openai_key("sk-teste") do
        expect { post "/products/items", params: { item: { title: "Com" } }, headers: headers, as: :json }
          .to have_enqueued_job(Products::EmbedItemsJob)
      end

      with_openai_key(nil) do
        expect { post "/products/items", params: { item: { title: "Sem" } }, headers: headers, as: :json }
          .not_to have_enqueued_job(Products::EmbedItemsJob)
      end
    end

    it "422 com o campo em destaque quando falta o título" do
      post "/products/items", params: { item: { title: "" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json["error"]).to include("code" => "unprocessable", "field" => "title")
      expect(json.dig("error", "details", "title")).to be_present
    end

    it "422 para SKU repetido, no campo certo" do
      create(:product_item, organization: organization, external_id: "A1")

      post "/products/items", params: { item: { title: "x", externalId: "A1" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("externalId")
    end

    it "422 para link que não é http(s)" do
      post "/products/items", params: { item: { title: "x", url: "javascript:alert(1)" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("url")
    end

    it "422 para valor fora do tipo do campo" do
      create(:product_field_definition, organization: organization, name: "Preço", value_type: "number")

      post "/products/items", params: { item: { title: "x", customFields: { preco: "caro" } } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("customFields")
    end

    it "fala no idioma da requisição" do
      post "/products/items", params: { item: { title: "" } }, headers: headers.merge("Accept-Language" => "en"), as: :json

      expect(json.dig("error", "message")).to eq("title can't be blank")
    end

    # Duas requisições passam juntas pela validação de unicidade.
    it "422, não 500, quando o banco recusa o SKU duplicado na disputa" do
      allow_any_instance_of(Products::SaveItem).to receive(:call).and_raise(ActiveRecord::RecordNotUnique)

      post "/products/items", params: { item: { title: "x" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("conflict")
    end

    it "400 sem o envelope `item`" do
      post "/products/items", params: { title: "x" }, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "code")).to eq("parameterMissing")
    end

    it "400, e não 500, com envelope que não é objeto" do
      post "/products/items", params: { item: "nao-e-objeto" }, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "code")).to eq("parameterMissing")
    end

    it "o formulário que devolve o SKU em branco não apaga a chave de um item importado" do
      item = create(:product_item, organization: organization, external_id: "auto:abc123", title: "Importado")

      patch "/products/items/#{item.id}", params: { item: { title: "Editado", externalId: "" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(item.reload).to have_attributes(title: "Editado", external_id: "auto:abc123")
    end
  end

  describe "PATCH /products/items/:id" do
    let(:item) { create(:product_item, organization: organization, title: "Antiga", tags: %w[velha]) }

    it "atualiza só o que veio" do
      patch "/products/items/#{item.id}", params: { item: { title: "Nova" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("title" => "Nova", "tags" => %w[velha])
      expect(item.reload.title).to eq("Nova")
    end

    it "mantém os vínculos quando `categoryIds` não vem, e remove com a lista vazia" do
      category = create(:product_category, organization: organization)
      item.sync_categories([ category.id ])

      patch "/products/items/#{item.id}", params: { item: { title: "Nova" } }, headers: headers, as: :json
      expect(json["categories"].size).to eq(1)

      patch "/products/items/#{item.id}", params: { item: { categoryIds: [] } }, headers: headers, as: :json
      expect(json["categories"]).to eq([])
      expect(category.reload.items_count).to eq(0)
    end

    it "404 para item de outra organização, sem tocar nele" do
      foreign = create(:product_item, organization: other_organization, title: "Alheia")

      patch "/products/items/#{foreign.id}", params: { item: { title: "x" } }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(foreign.reload.title).to eq("Alheia")
    end

    it "422 quando inválido" do
      patch "/products/items/#{item.id}", params: { item: { title: "" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(item.reload.title).to eq("Antiga")
    end
  end

  describe "DELETE /products/items/:id" do
    it "204 e some" do
      item = create(:product_item, organization: organization)

      delete "/products/items/#{item.id}", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(Products::Item.exists?(item.id)).to be(false)
    end

    it "404 para item de outra organização" do
      foreign = create(:product_item, organization: other_organization)

      delete "/products/items/#{foreign.id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(Products::Item.exists?(foreign.id)).to be(true)
    end
  end

  describe "POST /products/items/bulk-destroy" do
    it "apaga os da organização, ignorando os de fora" do
      own = create_list(:product_item, 2, organization: organization)
      foreign = create(:product_item, organization: other_organization)

      post "/products/items/bulk-destroy",
        params: { ids: own.map(&:id) + [ foreign.id, "nao-e-uuid" ] }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to eq("deleted" => 2)
      expect(Products::Item.exists?(foreign.id)).to be(true)
    end

    it "sem ids, não apaga nada" do
      create(:product_item, organization: organization)

      post "/products/items/bulk-destroy", params: {}, headers: headers, as: :json

      expect(json).to eq("deleted" => 0)
      expect(Products::Item.for_organization(organization.id).count).to eq(1)
    end

    it "422 acima do teto" do
      stub_const("Products::ItemsController::MAX_BULK_IDS", 1)

      post "/products/items/bulk-destroy", params: { ids: %w[a b] }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("tooManyIds")
    end
  end
end
