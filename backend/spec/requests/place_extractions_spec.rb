require "rails_helper"

# Origem: spec/requests/api/platform/apify_extractions_spec.rb, lá toda em dublês.
RSpec.describe "Extrações de estabelecimentos", type: :request do
  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization, role: "owner", name: "Marina Duarte") }
  let(:headers) { auth_headers(owner) }

  around { |example| with_env("APIFY_API_TOKEN" => "chave-do-apify") { example.run } }

  def extraction_of(*traits, **attributes)
    create(:outreach_place_extraction, *traits, organization: organization, **attributes)
  end

  describe "sessão e permissão" do
    it "sem sessão, responde 401" do
      get "/place-extractions", as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    context "sem a permissão de campanhas" do
      let(:role) { create(:access_role, organization: organization, permissions: AccessRole::BLANK_PERMISSIONS) }
      let(:member) { create(:account, organization: organization, role: "member", access_role: role) }

      it "não lista" do
        get "/place-extractions", headers: auth_headers(member), as: :json

        expect(response).to have_http_status(:forbidden)
      end

      it "não cria" do
        post "/place-extractions", params: { searchQuery: "padaria" }, headers: auth_headers(member), as: :json

        expect(response).to have_http_status(:forbidden)
      end

      it "não lê os contatos" do
        get "/place-extractions/contacts", headers: auth_headers(member), as: :json

        expect(response).to have_http_status(:forbidden)
      end
    end
  end

  describe "isolamento entre organizações" do
    let(:foreign) { create(:outreach_place_extraction, :completed, organization: create(:organization)) }

    it "a lista só traz as da organização" do
      extraction_of(search_query: "minha")
      foreign

      get "/place-extractions", headers: headers, as: :json

      expect(json["extractions"].map { |item| item["searchQuery"] }).to eq([ "minha" ])
    end

    it "os contatos só trazem os da organização" do
      foreign

      get "/place-extractions/contacts", headers: headers, as: :json

      expect(json["contacts"]).to eq([])
    end

    it "GET de outra organização responde 404" do
      get "/place-extractions/#{foreign.id}", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end

    it "os resultados de outra organização respondem 404" do
      get "/place-extractions/#{foreign.id}/results", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end

    it "DELETE de outra organização responde 404 e não apaga" do
      delete "/place-extractions/#{foreign.id}", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(Outreach::PlaceExtraction.where(_id: foreign.id).exists?).to be(true)
    end
  end

  describe "POST /place-extractions" do
    it "cria e enfileira" do
      expect { post "/place-extractions", params: { searchQuery: "pizzaria", location: "Curitiba, PR" }, headers: headers, as: :json }
        .to have_enqueued_job(Outreach::PlaceExtractionJob).on_queue("campaigns")

      expect(response).to have_http_status(:created)
      expect(json["extraction"]).to include(
        "status" => "pending",
        "searchQuery" => "pizzaria",
        "location" => "Curitiba, PR",
        "maxPlaces" => 100,
        "language" => "pt-BR",
        "resultsCount" => 0,
        "createdBy" => { "id" => owner.id, "name" => "Marina Duarte" }
      )
    end

    it "limita a quantidade" do
      post "/place-extractions", params: { searchQuery: "pizzaria", maxPlaces: 5000 }, headers: headers, as: :json

      expect(json.dig("extraction", "maxPlaces")).to eq(200)
    end

    it "guarda os filtros, e devolve em camelCase" do
      post "/place-extractions", params: { searchQuery: "pizzaria", minScore: 4.5, categoryFilter: "pizza", reviewsSort: "newest", skipClosedPlaces: true }, headers: headers, as: :json

      expect(json.dig("extraction", "filters")).to eq("minScore" => 4.5, "categoryFilter" => "pizza", "reviewsSort" => "newest", "skipClosedPlaces" => true)
    end

    it "sem a busca, responde 422" do
      post "/place-extractions", params: { searchQuery: "  " }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "unprocessable", "field" => "searchQuery")
    end

    it "sem a chave do Apify, responde 422 e nada entra na fila" do
      with_env("APIFY_API_TOKEN" => nil) do
        expect { post "/place-extractions", params: { searchQuery: "pizzaria" }, headers: headers, as: :json }
          .not_to have_enqueued_job(Outreach::PlaceExtractionJob)
      end

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("apifyNotConfigured")
    end

    it "com buscas demais em andamento, responde 422" do
      PlaceExtractionsController::MAX_IN_PROGRESS.times { extraction_of }

      post "/place-extractions", params: { searchQuery: "pizzaria" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("tooManyExtractions")
    end

    it "o limite é por organização" do
      PlaceExtractionsController::MAX_IN_PROGRESS.times { create(:outreach_place_extraction, organization: create(:organization)) }

      post "/place-extractions", params: { searchQuery: "pizzaria" }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
    end
  end

  describe "GET /place-extractions" do
    it "lista da mais nova para a mais antiga, sem os resultados" do
      older = extraction_of(:completed, created_at: 1.day.ago)
      newer = extraction_of

      get "/place-extractions", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["extractions"].map { |item| item["id"] }).to eq([ newer.id.to_s, older.id.to_s ])
      expect(json["extractions"].first.keys).not_to include("results")
      expect(json["meta"]).to include("total" => 2)
    end

    it "filtra por situação" do
      extraction_of(:completed, search_query: "pronta")
      extraction_of(search_query: "na fila")

      get "/place-extractions", params: { status: "completed" }, headers: headers

      expect(json["extractions"].map { |item| item["searchQuery"] }).to eq([ "pronta" ])
    end

    it "filtra por mais de uma situação" do
      extraction_of(:completed, search_query: "pronta", created_at: 1.hour.ago)
      extraction_of(search_query: "na fila")
      extraction_of(status: "running", search_query: "buscando", created_at: 2.hours.ago)

      get "/place-extractions", params: { status: "completed,running" }, headers: headers

      expect(json["extractions"].map { |item| item["searchQuery"] }).to eq([ "pronta", "buscando" ])
    end

    it "busca pelo texto, tratando o texto como texto" do
      extraction_of(search_query: "padaria (centro)")
      extraction_of(search_query: "oficina")

      get "/place-extractions", params: { search: "padaria (" }, headers: headers

      expect(json["extractions"].map { |item| item["searchQuery"] }).to eq([ "padaria (centro)" ])
    end
  end

  describe "GET /place-extractions/:id" do
    it "devolve a extração" do
      extraction = extraction_of(:completed)

      get "/place-extractions/#{extraction.id}", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["extraction"]).to include("id" => extraction.id.to_s, "status" => "completed", "resultsCount" => 1, "durationSeconds" => 60.0)
    end

    it "traduz o motivo da falha" do
      extraction = extraction_of(status: "failed", error_code: "apifyQuotaExceeded")

      get "/place-extractions/#{extraction.id}", headers: headers.merge("Accept-Language" => "en"), as: :json

      expect(json["extraction"]).to include("errorCode" => "apifyQuotaExceeded", "errorMessage" => "The Apify credits ran out.")
    end

    it "o que o Apify disse tem prioridade" do
      extraction = extraction_of(status: "failed", error_code: "apifyFailed", error_message: "Ator fora do ar")

      get "/place-extractions/#{extraction.id}", headers: headers, as: :json

      expect(json.dig("extraction", "errorMessage")).to eq("Ator fora do ar")
    end

    it "um id que não existe responde 404" do
      get "/place-extractions/nao-existe", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "GET /place-extractions/:id/results" do
    it "devolve os resultados em camelCase" do
      extraction = extraction_of(:completed)

      get "/place-extractions/#{extraction.id}/results", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("id" => extraction.id.to_s, "status" => "completed", "resultsCount" => 1)
      expect(json["results"].first).to include("title" => "Padaria Pão Quente", "phoneUnformatted" => "554133330000", "categoryName" => "Padaria", "placeId" => "lugar-1")
    end

    it "em andamento, a lista vem vazia" do
      get "/place-extractions/#{extraction_of(status: 'running').id}/results", headers: headers, as: :json

      expect(json).to include("status" => "running", "results" => [], "resultsCount" => 0)
    end
  end

  describe "GET /place-extractions/contacts" do
    def place(title, **extra)
      { "title" => title, "phone" => "(41) 3333-0000", "phone_unformatted" => "554133330000", "address" => "Rua XV", "category_name" => "Padaria", "place_id" => title.parameterize, **extra }
    end

    it "junta os lugares de todas as concluídas, dizendo de onde cada um veio" do
      extraction = extraction_of(:completed, search_query: "padaria", location: "Curitiba", results: [ place("Pão Quente"), place("Pão Doce") ])
      extraction_of(status: "running", results: [ place("Em andamento") ])

      get "/place-extractions/contacts", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["contacts"].map { |item| item["title"] }).to contain_exactly("Pão Quente", "Pão Doce")
      expect(json["contacts"].first).to include(
        "phoneUnformatted" => "554133330000",
        "placeId" => a_string_matching(/pao/),
        "extractionId" => extraction.id.to_s,
        "extractionQuery" => "padaria",
        "extractionLocation" => "Curitiba",
        "extractedAt" => be_a(Integer)
      )
      expect(json["meta"]).to include("total" => 2, "totalPages" => 1, "hasMore" => false)
    end

    it "pagina" do
      extraction_of(:completed, results: Array.new(3) { |index| place("Lugar #{index}") })

      get "/place-extractions/contacts", params: { page: 2, perPage: 2 }, headers: headers

      expect(json["contacts"].size).to eq(1)
      expect(json["meta"]).to include("page" => 2, "perPage" => 2, "total" => 3, "totalPages" => 2, "hasMore" => false)
    end

    it "busca em nome, endereço, telefone e categoria, tratando o texto como texto" do
      extraction_of(:completed, results: [
        place("Café (Centro)", category_name: "Cafeteria"),
        place("Oficina do Zé", category_name: "Mecânica", phone: "(41) 9999-0000", address: "Av. Brasil")
      ])

      get "/place-extractions/contacts", params: { search: "café (" }, headers: headers
      expect(json["contacts"].map { |item| item["title"] }).to eq([ "Café (Centro)" ])

      get "/place-extractions/contacts", params: { search: "mecânica" }, headers: headers
      expect(json["contacts"].map { |item| item["title"] }).to eq([ "Oficina do Zé" ])

      get "/place-extractions/contacts", params: { search: "av. brasil" }, headers: headers
      expect(json["meta"]["total"]).to eq(1)
    end

    it "sem nada encontrado, vazio" do
      get "/place-extractions/contacts", headers: headers, as: :json

      expect(json).to include("contacts" => [], "meta" => hash_including("total" => 0, "totalPages" => 0))
    end
  end

  describe "DELETE /place-extractions/:id" do
    it "apaga" do
      extraction = extraction_of

      delete "/place-extractions/#{extraction.id}", headers: headers, as: :json

      expect(response).to have_http_status(:no_content)
      expect(Outreach::PlaceExtraction.where(_id: extraction.id).exists?).to be(false)
    end
  end
end
