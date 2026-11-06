require "rails_helper"

RSpec.describe "Grupos de permissões", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization, role: "owner") }
  let(:attendant) { create(:account, organization: organization, role: "member") }
  let(:manager_role) { organization.access_roles.find_by!(name: "Gerente") }
  let(:member_role) { organization.access_roles.find_by!(name: "Usuário") }
  let(:foreign_role) { create(:access_role, organization: create(:organization)) }

  it "exige sessão" do
    get "/access-roles"
    expect(response).to have_http_status(:unauthorized)

    post "/access-roles", params: { name: "X" }, as: :json
    expect(response).to have_http_status(:unauthorized)
  end

  it "exige core_settings em tudo, inclusive para ler" do
    headers = auth_headers(attendant)

    get "/access-roles", headers: headers
    expect(response).to have_http_status(:forbidden)

    get "/access-roles/#{member_role.id}", headers: headers
    expect(response).to have_http_status(:forbidden)

    post "/access-roles", params: { name: "Novo" }, headers: headers, as: :json
    expect(response).to have_http_status(:forbidden)

    patch "/access-roles/#{member_role.id}", params: { permissions: { chat: "none" } }, headers: headers, as: :json
    expect(response).to have_http_status(:forbidden)

    delete "/access-roles/#{create(:access_role, organization: organization).id}", headers: headers
    expect(response).to have_http_status(:forbidden)
  end

  describe "GET /access-roles" do
    it "lista os grupos da organização, dizendo quais são padrão e quantos usam" do
      custom = create(:access_role, :member, organization: organization, name: "Atendimento")
      create(:account, organization: organization, role: "member", access_role: custom)
      revoked = create(:account, organization: organization, role: "member", access_role: custom)
      revoked.revoke!

      get "/access-roles", headers: auth_headers(owner)

      expect(response).to have_http_status(:ok)
      expect(json["accessRoles"].map { |r| r["name"] }).to eq(%w[Atendimento Gerente Usuário])
      expect(json["accessRoles"].first).to include(
        "default" => false, "defaultKey" => nil, "accountsCount" => 1
      )
      expect(json["accessRoles"].second).to include("default" => true, "defaultKey" => "manager")
      expect(json["accessRoles"].third).to include("default" => true, "defaultKey" => "member")
      expect(json["accessRoles"].third["permissions"]).to eq(AccessRole::MEMBER_PERMISSIONS)
      expect(json["meta"]).to include("total" => 3)
    end

    it "não mostra grupo de outra organização" do
      foreign_role

      get "/access-roles", headers: auth_headers(owner)

      expect(json["accessRoles"].map { |r| r["id"] }).not_to include(foreign_role.id)
    end
  end

  describe "GET /access-roles/:id" do
    it "mostra o grupo" do
      get "/access-roles/#{manager_role.id}", headers: auth_headers(owner)

      expect(json).to include("id" => manager_role.id, "name" => "Gerente")
    end

    it "responde 404 para outra organização" do
      get "/access-roles/#{foreign_role.id}", headers: auth_headers(owner)

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /access-roles" do
    it "cria com nada liberado além do que veio" do
      post "/access-roles",
        params: { name: "Atendimento", permissions: { chat: "all", chat_list_to: "team" } },
        headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:created)
      expect(json["permissions"]).to include("chat" => "all", "chat_list_to" => "team", "dashboard" => "none")
      expect(json["permissions"].keys).to match_array(AccessRole::KEYS)
    end

    it "aceita as chaves em camelCase, como o resto da entrada" do
      post "/access-roles",
        params: { name: "Atendimento", permissions: { customDashboards: "all" } },
        headers: auth_headers(owner), as: :json

      expect(json["permissions"]).to include("custom_dashboards" => "all")
    end

    it "responde 422 sem nome" do
      post "/access-roles", params: { name: "" }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("name")
    end

    it "responde 422 com nome repetido" do
      post "/access-roles", params: { name: "Gerente" }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "recusa recurso que não existe" do
      post "/access-roles", params: { name: "X", permissions: { banana: "all" } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("permissions")
    end

    # "Qualquer valor diferente de none libera": um nível inventado daria acesso.
    it "recusa nível que não existe" do
      post "/access-roles", params: { name: "X", permissions: { chat: "talvez" } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("permissions")
    end

    it "só aceita em chat_list_to os valores de visibilidade" do
      post "/access-roles", params: { name: "X", permissions: { chat_list_to: "none" } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "PATCH /access-roles/:id" do
    let(:custom) { create(:access_role, :member, organization: organization, name: "Atendimento") }

    it "mescla as permissões: quem manda uma chave não apaga as outras" do
      patch "/access-roles/#{custom.id}", params: { permissions: { campaigns: "all" } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:ok)
      expect(json["permissions"]).to include("campaigns" => "all", "chat" => "all")
    end

    it "renomeia grupo comum" do
      patch "/access-roles/#{custom.id}", params: { name: "Suporte" }, headers: auth_headers(owner), as: :json

      expect(json["name"]).to eq("Suporte")
    end

    it "muda o que as pessoas do grupo podem fazer" do
      person = create(:account, organization: organization, role: "member", access_role: custom)
      expect(person.can?(:campaigns)).to be(false)

      patch "/access-roles/#{custom.id}", params: { permissions: { campaigns: "all" } }, headers: auth_headers(owner), as: :json

      expect(person.reload.can?(:campaigns)).to be(true)
    end

    it "não renomeia grupo padrão" do
      patch "/access-roles/#{manager_role.id}", params: { name: "Chefia" }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("name")
      expect(manager_role.reload.name).to eq("Gerente")
    end

    it "edita as permissões de grupo padrão" do
      patch "/access-roles/#{member_role.id}", params: { permissions: { pipelines: "all" } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:ok)
      expect(json["permissions"]).to include("pipelines" => "all")
    end

    it "responde 404 para outra organização" do
      patch "/access-roles/#{foreign_role.id}", params: { name: "Invadido" }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "DELETE /access-roles/:id" do
    it "apaga grupo em uso: as pessoas ficam sem grupo e valem pelos padrões de membro" do
      custom = create(:access_role, organization: organization, name: "Chefia")
      person = create(:account, organization: organization, role: "member", access_role: custom)
      expect(person.can?(:campaigns)).to be(true)

      delete "/access-roles/#{custom.id}", headers: auth_headers(owner)

      expect(response).to have_http_status(:no_content)
      expect(person.reload.access_role_id).to be_nil
      expect(person.can?(:campaigns)).to be(false)
      expect(person.can?(:chat)).to be(true)
    end

    it "não apaga grupo padrão" do
      delete "/access-roles/#{manager_role.id}", headers: auth_headers(owner)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("defaultAccessRole")
      expect(AccessRole.exists?(manager_role.id)).to be(true)
    end

    it "responde 404 para outra organização" do
      delete "/access-roles/#{foreign_role.id}", headers: auth_headers(owner)

      expect(response).to have_http_status(:not_found)
      expect(AccessRole.exists?(foreign_role.id)).to be(true)
    end
  end
end
