require "rails_helper"

RSpec.describe "Departamentos", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization, role: "owner") }
  let(:attendant) { create(:account, organization: organization, role: "member") }
  let(:foreign_team) { create(:team, organization: create(:organization)) }

  it "exige sessão" do
    get "/teams"
    expect(response).to have_http_status(:unauthorized)

    post "/teams", params: { name: "Suporte" }, as: :json
    expect(response).to have_http_status(:unauthorized)
  end

  describe "GET /teams" do
    it "lista em ordem de nome, contando só quem está ativo" do
      zebra = create(:team, organization: organization, name: "Vendas")
      alfa = create(:team, organization: organization, name: "Atendimento", active: false)
      create(:team_membership, team: alfa, account: attendant)
      revoked = create(:account, organization: organization, role: "member")
      create(:team_membership, team: alfa, account: revoked)
      revoked.revoke!

      get "/teams", headers: auth_headers(owner)

      expect(response).to have_http_status(:ok)
      expect(json["teams"].map { |t| t["id"] }).to eq([ alfa.id, zebra.id ])
      expect(json["teams"].first).to include("name" => "Atendimento", "active" => false, "accountsCount" => 1)
      expect(json["teams"].first["createdAt"]).to be_a(Integer)
      expect(json["meta"]).to include("total" => 2)
    end

    # O chat transfere conversas para departamentos e a agenda filtra por eles.
    it "abre a leitura a quem não tem core_settings" do
      create(:team, organization: organization)

      get "/teams", headers: auth_headers(attendant)

      expect(response).to have_http_status(:ok)
      expect(json["teams"].size).to eq(1)
    end

    it "filtra por situação" do
      on = create(:team, organization: organization)
      create(:team, organization: organization, active: false)

      get "/teams", params: { active: "true" }, headers: auth_headers(owner)

      expect(json["teams"].map { |t| t["id"] }).to eq([ on.id ])
    end

    it "não mostra departamento de outra organização" do
      foreign_team

      get "/teams", headers: auth_headers(owner)

      expect(json["teams"]).to be_empty
    end
  end

  describe "GET /teams/:id" do
    it "mostra o departamento a qualquer sessão" do
      team = create(:team, organization: organization)

      get "/teams/#{team.id}", headers: auth_headers(attendant)

      expect(json).to include("id" => team.id, "active" => true, "accountsCount" => 0)
    end

    it "responde 404 para outra organização" do
      get "/teams/#{foreign_team.id}", headers: auth_headers(owner)

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /teams" do
    it "exige o envelope: corpo solto responde 400" do
      post "/teams", params: { name: "Pós-venda" }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "field")).to eq("team")
    end

    it "cria ativo por padrão" do
      post "/teams", params: { team: { name: " Pós-venda " } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:created)
      expect(json).to include("name" => "Pós-venda", "active" => true)
      expect(organization.teams.count).to eq(1)
    end

    it "cria inativo se pedido" do
      post "/teams", params: { team: { name: "Pós-venda", active: false } }, headers: auth_headers(owner), as: :json

      expect(json["active"]).to be(false)
    end

    it "exige core_settings" do
      post "/teams", params: { team: { name: "Pós-venda" } }, headers: auth_headers(attendant), as: :json

      expect(response).to have_http_status(:forbidden)
    end

    it "responde 422 sem nome" do
      post "/teams", params: { team: { name: " " } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("name")
    end

    it "responde 422 com nome repetido na mesma organização" do
      create(:team, organization: organization, name: "Vendas")

      post "/teams", params: { team: { name: "Vendas" } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "aceita o mesmo nome em outra organização" do
      create(:team, organization: create(:organization), name: "Vendas")

      post "/teams", params: { team: { name: "Vendas" } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:created)
    end
  end

  describe "PATCH /teams/:id" do
    let(:team) { create(:team, organization: organization) }

    it "renomeia e desativa" do
      patch "/teams/#{team.id}", params: { team: { name: "Novo nome", active: false } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("name" => "Novo nome", "active" => false)
    end

    it "exige core_settings" do
      patch "/teams/#{team.id}", params: { team: { name: "Novo nome" } }, headers: auth_headers(attendant), as: :json

      expect(response).to have_http_status(:forbidden)
    end

    it "responde 422 com nome vazio" do
      patch "/teams/#{team.id}", params: { team: { name: "" } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 404 para outra organização" do
      patch "/teams/#{foreign_team.id}", params: { team: { name: "Invadido" } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "DELETE /teams/:id" do
    let(:team) { create(:team, organization: organization) }

    it "apaga o departamento e os vínculos, sem apagar as pessoas" do
      create(:team_membership, team: team, account: attendant)

      delete "/teams/#{team.id}", headers: auth_headers(owner)

      expect(response).to have_http_status(:no_content)
      expect(Team.exists?(team.id)).to be(false)
      expect(Account.exists?(attendant.id)).to be(true)
      expect(attendant.reload.teams).to be_empty
    end

    it "exige core_settings" do
      delete "/teams/#{team.id}", headers: auth_headers(attendant)

      expect(response).to have_http_status(:forbidden)
      expect(Team.exists?(team.id)).to be(true)
    end

    it "responde 404 para outra organização" do
      delete "/teams/#{foreign_team.id}", headers: auth_headers(owner)

      expect(response).to have_http_status(:not_found)
      expect(Team.exists?(foreign_team.id)).to be(true)
    end
  end
end
