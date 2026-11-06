require "rails_helper"

RSpec.describe "Pipelines: filtros salvos", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }
  let(:board) { create(:pipeline_board, organization: organization) }
  let(:filters_path) { board_path(board, "/saved-filters") }
  let(:definition) { { version: 1, all: [ { field: "deal_value", operator: "gt", value: 100 } ], any: [] } }

  it "exige sessão e permissão" do
    get filters_path
    expect(response).to have_http_status(:unauthorized)

    get filters_path, headers: auth_headers(member_with(chat: "all"))
    expect(response).to have_http_status(:forbidden)
  end

  it "responde 404 para quadro de outra organização" do
    get board_path(create(:pipeline_board), "/saved-filters"), headers: headers

    expect(response).to have_http_status(:not_found)
  end

  describe "GET" do
    it "traz os prontos e os salvos, com o que a pessoa pode ver" do
      mine = create(:pipeline_saved_filter, board: board, owner: owner, name: "Meu")
      shared = create(:pipeline_saved_filter, board: board, visibility: "shared", name: "Do time")
      create(:pipeline_saved_filter, board: board, name: "Privado de outra pessoa")

      get filters_path, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["presets"].map { |preset| preset["key"] }).to include("open_deals", "my_deals", "assigned_to_deactivated")
      expect(json["presets"].first).to include("nameKey" => "pipelines.filters.presets.open_deals", "isPreset" => true, "favorite" => false)

      expect(json["filters"].map { |filter| filter["id"] }).to contain_exactly(mine.id, shared.id)
      mine_json = json["filters"].find { |filter| filter["id"] == mine.id }
      expect(mine_json).to include("editable" => true, "isPreset" => false)
      expect(mine_json["owner"]).to eq("id" => owner.id, "name" => owner.name)
      expect(json["filters"].find { |filter| filter["id"] == shared.id }).to include("editable" => false)
    end
  end

  describe "POST" do
    it "cria privado por padrão, com a definição como veio" do
      post filters_path, params: { savedFilter: { name: "Grandes", definition: definition } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json).to include("name" => "Grandes", "visibility" => "private", "editable" => true, "favorite" => false)
      expect(json["definition"]["all"].first).to eq("field" => "deal_value", "operator" => "gt", "value" => 100)
    end

    it "responde 422 para definição inválida, com o motivo na língua de quem pediu" do
      invalid = { version: 1, all: [ { field: "senha", operator: "eq", value: "x" } ] }

      post filters_path, params: { savedFilter: { name: "Ruim", definition: invalid } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("definition")
      expect(json.dig("error", "details", "definition").first).to include("campo desconhecido", "senha")

      post filters_path, params: { savedFilter: { name: "Ruim", definition: invalid } },
        headers: headers.merge("Accept-Language" => "en"), as: :json
      expect(json.dig("error", "details", "definition").first).to include("unknown field")
    end

    it "responde 422 para definição que não é objeto, sem nome e com visibilidade desconhecida" do
      post filters_path, params: { savedFilter: { name: "X", definition: "abc" } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)

      post filters_path, params: { savedFilter: { name: "", definition: definition } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)

      post filters_path, params: { savedFilter: { name: "X", visibility: "publico", definition: definition } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "PATCH e DELETE" do
    it "só quem criou altera e apaga" do
      shared = create(:pipeline_saved_filter, board: board, visibility: "shared")

      patch "#{filters_path}/#{shared.id}", params: { savedFilter: { name: "Roubado" } }, headers: headers, as: :json
      expect(response).to have_http_status(:forbidden)

      delete "#{filters_path}/#{shared.id}", headers: headers
      expect(response).to have_http_status(:forbidden)
    end

    it "altera e apaga o próprio" do
      mine = create(:pipeline_saved_filter, board: board, owner: owner)

      patch "#{filters_path}/#{mine.id}", params: { savedFilter: { name: "Novo nome", visibility: "shared" } }, headers: headers, as: :json
      expect(json).to include("name" => "Novo nome", "visibility" => "shared")

      delete "#{filters_path}/#{mine.id}", headers: headers
      expect(response).to have_http_status(:no_content)
    end

    it "filtro privado de outra pessoa é 404" do
      hidden = create(:pipeline_saved_filter, board: board)

      patch "#{filters_path}/#{hidden.id}", params: { savedFilter: { name: "X" } }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST toggle-favorite" do
    it "favorita e desfavorita um filtro salvo" do
      filter = create(:pipeline_saved_filter, board: board, owner: owner)

      post "#{filters_path}/toggle-favorite", params: { savedFilterId: filter.id }, headers: headers, as: :json
      expect(json).to eq("favorite" => true)

      get filters_path, headers: headers
      expect(json["filters"].first).to include("favorite" => true)

      post "#{filters_path}/toggle-favorite", params: { savedFilterId: filter.id }, headers: headers, as: :json
      expect(json).to eq("favorite" => false)
    end

    it "favorita um filtro pronto" do
      post "#{filters_path}/toggle-favorite", params: { presetKey: "my_deals" }, headers: headers, as: :json
      expect(json).to eq("favorite" => true)

      get filters_path, headers: headers
      expect(json["presets"].find { |preset| preset["key"] == "my_deals" }).to include("favorite" => true)
    end

    it "responde 404 para filtro pronto desconhecido e para filtro que a pessoa não vê" do
      post "#{filters_path}/toggle-favorite", params: { presetKey: "nao_existe" }, headers: headers, as: :json
      expect(response).to have_http_status(:not_found)

      hidden = create(:pipeline_saved_filter, board: board)
      post "#{filters_path}/toggle-favorite", params: { savedFilterId: hidden.id }, headers: headers, as: :json
      expect(response).to have_http_status(:not_found)
    end

    it "responde 422 sem alvo" do
      post "#{filters_path}/toggle-favorite", params: {}, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end
  end
end
