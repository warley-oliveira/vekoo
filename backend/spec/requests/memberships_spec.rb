require "rails_helper"

RSpec.describe "Organizações da pessoa", type: :request do
  let(:organization) { create(:organization, name: "Marina Duarte Conteúdo") }
  let!(:owner) { create(:account, organization: organization, role: "owner", name: "Marina Duarte") }
  let(:member) { create(:account, organization: organization, role: "member", name: "Camila Rocha") }
  let(:other) { create(:account, organization: create(:organization), role: "owner", name: "Pessoa de Fora") }

  def bearer(user)
    { "Authorization" => "Bearer #{Session.start!(user).token}" }
  end

  describe "GET /accounts" do
    it "lista os vínculos ativos da pessoa, sem o revogado nem o de suporte" do
      clinic = create(:account, user: owner.user, role: "member")
      revoked = create(:account, user: owner.user, role: "member")
      revoked.update_column(:revoked_at, Time.current)

      get "/accounts", headers: bearer(owner.user)

      expect(response).to have_http_status(:ok)
      expect(json["accounts"].map { |a| a["hashid"] }).to eq([ owner.hashid, clinic.hashid ])
      expect(json["accounts"].first).to include("role" => "owner", "support" => false)
      expect(json["accounts"].first["organization"]).to include("id" => organization.id, "name" => "Marina Duarte Conteúdo")
    end

    it "exige sessão" do
      get "/accounts"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "POST /organizations" do
    it "cria a organização com a pessoa como dona, e os grupos padrão" do
      expect {
        post "/organizations", params: { organization: { name: "Clínica Bem Viver" } }, headers: bearer(owner.user), as: :json
      }.to change(Organization, :count).by(1).and change(Account, :count).by(1)

      expect(response).to have_http_status(:created)
      created = Account.find_by_hashid_for(owner.user, json["hashid"])
      expect(created).to have_attributes(role: "owner", user_id: owner.user_id)
      expect(created.organization.name).to eq("Clínica Bem Viver")
      expect(created.organization.access_roles.count).to eq(2)
    end

    it "valida o nome" do
      post "/organizations", params: { organization: { name: "" } }, headers: bearer(owner.user), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("name")
    end
  end

  describe "POST /users/:id/transfer-ownership" do
    it "passa a posse: a pessoa vira dona e quem era dono vira membro" do
      post "/users/#{member.id}/transfer-ownership", headers: auth_headers(owner)

      expect(response).to have_http_status(:ok)
      expect(member.reload.role).to eq("owner")
      expect(owner.reload.role).to eq("member")
    end

    it "só dono passa a posse" do
      manager_role = organization.access_roles.find_by!(name: "Gerente")
      manager = create(:account, organization: organization, role: "member", access_role: manager_role)

      post "/users/#{member.id}/transfer-ownership", headers: auth_headers(manager)

      expect(response).to have_http_status(:forbidden)
      expect(member.reload.role).to eq("member")
    end

    it "não passa para quem está revogado" do
      member.update_column(:revoked_at, Time.current)

      post "/users/#{member.id}/transfer-ownership", headers: auth_headers(owner)

      expect(json.dig("error", "code")).to eq("accountRevoked")
      expect(owner.reload.role).to eq("owner")
    end
  end

  describe "POST /users/leave" do
    it "tira o próprio vínculo, sem apagar a pessoa nem a outra organização dela" do
      elsewhere = create(:account, user: member.user, role: "member")

      post "/users/leave", headers: auth_headers(member)

      expect(response).to have_http_status(:no_content)
      expect(Account.exists?(member.id)).to be(false)
      expect(elsewhere.reload).to be_present
      expect(User.exists?(member.user_id)).to be(true)
    end

    it "o último dono não sai" do
      post "/users/leave", headers: auth_headers(owner)

      expect(json.dig("error", "code")).to eq("lastOwner")
      expect(Account.exists?(owner.id)).to be(true)
    end
  end

  describe "a identidade é da pessoa" do
    it "quem administra não troca nome, e-mail nem senha de quem também está em outra organização" do
      create(:account, user: member.user, role: "owner")

      patch "/users/#{member.id}", params: { user: { name: "Outro Nome", password: "senha-nova-123" } },
        headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("sharedIdentity")
      expect(member.user.reload.name).to eq("Camila Rocha")
      expect(member.user.authenticate("carrossel123")).to be_truthy
    end

    it "mas muda papel e grupo, que são do vínculo, e manda o mesmo nome de volta sem erro" do
      create(:account, user: member.user, role: "owner")
      role = organization.access_roles.find_by!(name: "Gerente")

      patch "/users/#{member.id}", params: { user: { name: "Camila Rocha", email: member.email, accessRoleId: role.id } },
        headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:ok)
      expect(member.reload.access_role).to eq(role)
    end

    it "o perfil muda o nome em todas as organizações" do
      clinic = create(:account, user: owner.user, role: "member")

      patch "/profile", params: { profile: { name: "Marina D." } }, headers: auth_headers(owner), as: :json

      expect(clinic.reload.name).to eq("Marina D.")
    end

    it "check-email diz que quem tem conta em outra organização pode ser convidado" do
      get "/users/check-email", params: { email: other.email }, headers: auth_headers(owner)

      expect(json).to eq("exists" => true, "hasOrganizationAccess" => false, "revoked" => false)
    end
  end
end
