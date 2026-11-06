require "rails_helper"

RSpec.describe "Pessoas da organização", type: :request do
  let(:organization) { create(:organization) }
  let!(:owner) { create(:account, organization: organization, role: "owner", name: "Marina Duarte") }
  let(:manager_role) { organization.access_roles.find_by!(name: "Gerente") }
  let(:member_role) { organization.access_roles.find_by!(name: "Usuário") }
  let(:manager) { create(:account, organization: organization, role: "member", access_role: manager_role, name: "Rafael Nunes") }
  let(:attendant) { create(:account, organization: organization, role: "member", access_role: member_role, name: "Camila Rocha") }

  let(:other_organization) { create(:organization) }
  let(:stranger) { create(:account, organization: other_organization, role: "owner", name: "Pessoa de Fora") }

  describe "sessão" do
    it "exige sessão em todas as rotas" do
      get "/users"
      expect(response).to have_http_status(:unauthorized)

      post "/users", params: { name: "X" }, as: :json
      expect(response).to have_http_status(:unauthorized)

      get "/users/check-email", params: { email: "x@exemplo.com.br" }
      expect(response).to have_http_status(:unauthorized)

      post "/users/#{attendant.id}/revoke"
      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "GET /users" do
    it "dá a quem administra a ficha inteira, em ordem de nome" do
      team = create(:team, organization: organization)
      create(:team_membership, team: team, account: attendant)
      attendant.update!(phone: "5511987654321", setup_only: true)

      get "/users", headers: auth_headers(owner)

      expect(response).to have_http_status(:ok)
      expect(json["users"].map { |u| u["name"] }).to eq([ "Camila Rocha", "Marina Duarte" ])
      expect(json["users"].first).to include(
        "id" => attendant.id,
        "email" => attendant.email,
        "phone" => "5511987654321",
        "role" => "member",
        "accessRoleId" => member_role.id,
        "teamIds" => [ team.id ],
        "setupOnly" => true,
        "revokedAt" => nil,
        "avatarUrl" => nil
      )
      expect(json["meta"]).to include("page" => 1, "total" => 2)
    end

    # O chat, a agenda e os pipelines listam colegas para atribuir: quem atende não tem
    # `core_settings` e precisa ler a lista.
    it "abre a leitura a quem não administra, só com o necessário para atribuir" do
      manager

      get "/users", headers: auth_headers(attendant)

      expect(response).to have_http_status(:ok)
      expect(json["users"].first.keys)
        .to contain_exactly("id", "name", "email", "avatarUrl", "teamIds", "setupOnly")
    end

    it "por padrão mostra só quem está ativo: ninguém atribui conversa a quem perdeu o acesso" do
      attendant.revoke!

      get "/users", headers: auth_headers(owner)

      expect(json["users"].map { |u| u["id"] }).to eq([ owner.id ])
    end

    it "mostra os revogados a quem administra, quando pedido" do
      attendant.revoke!

      get "/users", params: { status: "all" }, headers: auth_headers(owner)
      expect(json["users"].map { |u| u["id"] }).to contain_exactly(owner.id, attendant.id)

      get "/users", params: { status: "revoked" }, headers: auth_headers(owner)
      expect(json["users"].map { |u| u["id"] }).to eq([ attendant.id ])
      expect(json["users"].first["revokedAt"]).to be_a(Integer)
    end

    it "não mostra os revogados a quem não administra, mesmo pedindo" do
      revoked = create(:account, organization: organization, role: "member")
      revoked.revoke!

      get "/users", params: { status: "revoked" }, headers: auth_headers(attendant)
      expect(json["users"]).to be_empty

      get "/users", params: { status: "all" }, headers: auth_headers(attendant)
      expect(json["users"].map { |u| u["id"] }).not_to include(revoked.id)
    end

    it "busca por nome ou e-mail, sem tratar o termo como padrão" do
      attendant
      create(:account, organization: organization, role: "member", name: "Bruno 100%", email: "bruno@exemplo.com.br")

      get "/users", params: { q: "camila" }, headers: auth_headers(owner)
      expect(json["users"].map { |u| u["name"] }).to eq([ "Camila Rocha" ])

      get "/users", params: { q: "BRUNO@" }, headers: auth_headers(owner)
      expect(json["users"].map { |u| u["name"] }).to eq([ "Bruno 100%" ])

      get "/users", params: { q: "%" }, headers: auth_headers(owner)
      expect(json["users"].map { |u| u["name"] }).to eq([ "Bruno 100%" ])
    end

    it "filtra por departamento, grupo e papel" do
      team = create(:team, organization: organization)
      create(:team_membership, team: team, account: attendant)
      manager

      get "/users", params: { teamId: team.id }, headers: auth_headers(owner)
      expect(json["users"].map { |u| u["id"] }).to eq([ attendant.id ])

      get "/users", params: { accessRoleId: manager_role.id }, headers: auth_headers(owner)
      expect(json["users"].map { |u| u["id"] }).to eq([ manager.id ])

      get "/users", params: { role: "owner" }, headers: auth_headers(owner)
      expect(json["users"].map { |u| u["id"] }).to eq([ owner.id ])
    end

    it "pagina no formato único" do
      create_list(:account, 2, organization: organization, role: "member")

      get "/users", params: { page: 2, perPage: 2 }, headers: auth_headers(owner)

      expect(json["users"].size).to eq(1)
      expect(json["meta"]).to eq("page" => 2, "perPage" => 2, "total" => 3, "totalPages" => 2, "hasMore" => false)
    end

    it "não mostra gente de outra organização" do
      stranger

      get "/users", headers: auth_headers(owner)

      expect(json["users"].map { |u| u["id"] }).not_to include(stranger.id)
    end
  end

  describe "GET /users/:id" do
    it "mostra a ficha inteira a quem administra e o resumo aos demais" do
      get "/users/#{attendant.id}", headers: auth_headers(owner)
      expect(json).to have_key("permissions")

      get "/users/#{owner.id}", headers: auth_headers(attendant)
      expect(json.keys).to contain_exactly("id", "name", "email", "avatarUrl", "teamIds", "setupOnly")
    end

    it "responde 404 para gente de outra organização" do
      get "/users/#{stranger.id}", headers: auth_headers(owner)

      expect(response).to have_http_status(:not_found)
      expect(json.dig("error", "code")).to eq("notFound")
    end

    it "responde 404 a quem não administra, se a pessoa foi revogada" do
      manager.revoke!

      get "/users/#{manager.id}", headers: auth_headers(attendant)

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "GET /users/check-email" do
    it "responde 422 sem e-mail" do
      get "/users/check-email", headers: auth_headers(owner)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("email")
    end

    it "diz que o e-mail está livre" do
      get "/users/check-email", params: { email: "novo@exemplo.com.br" }, headers: auth_headers(owner)

      expect(json).to eq("exists" => false, "hasOrganizationAccess" => false, "revoked" => false)
    end

    it "reconhece quem já está na organização, normalizando o e-mail" do
      get "/users/check-email", params: { email: "  #{attendant.email.upcase} " }, headers: auth_headers(owner)

      expect(json).to eq("exists" => true, "hasOrganizationAccess" => true, "revoked" => false)
    end

    it "avisa que a pessoa está aqui, mas revogada: a tela oferece restaurar" do
      attendant.revoke!

      get "/users/check-email", params: { email: attendant.email }, headers: auth_headers(owner)

      expect(json).to eq("exists" => true, "hasOrganizationAccess" => true, "revoked" => true)
    end

    it "distingue quem tem conta em outra organização" do
      get "/users/check-email", params: { email: stranger.email }, headers: auth_headers(owner)

      expect(json).to eq("exists" => true, "hasOrganizationAccess" => false, "revoked" => false)
    end

    it "exige core_settings" do
      get "/users/check-email", params: { email: "x@exemplo.com.br" }, headers: auth_headers(attendant)

      expect(response).to have_http_status(:forbidden)
    end

    # Criar organização é aberto e quem cria vira dono: sem limite, esta rota varreria os
    # e-mails que o login protege.
    it "limita as tentativas por pessoa" do
      headers = auth_headers(owner)

      UsersController::EMAIL_PROBES_PER_MINUTE.times do |n|
        get "/users/check-email", params: { email: "tentativa#{n}@exemplo.com.br" }, headers: headers
      end
      expect(response).to have_http_status(:ok)

      get "/users/check-email", params: { email: "maisuma@exemplo.com.br" }, headers: headers
      expect(response).to have_http_status(:too_many_requests)
    end
  end

  describe "POST /users" do
    let(:valid) do
      { name: "Larissa Prado", email: "Larissa@Exemplo.com.br ", password: "carrossel123",
        phone: "5511912345678", setupOnly: true }
    end

    it "exige o envelope: corpo solto responde 400 e não cria ninguém" do
      headers = auth_headers(owner)

      expect {
        post "/users", params: valid, headers: headers, as: :json
      }.not_to change(Account, :count)

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "code")).to eq("parameterMissing")
      expect(json.dig("error", "field")).to eq("user")
    end

    it "responde 400, e não 500, se o envelope não for um objeto" do
      post "/users", params: { user: "texto" }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:bad_request)
    end

    it "cria a pessoa na organização, com senha e sem poder de dono" do
      expect {
        post "/users", params: { user: valid }, headers: auth_headers(owner), as: :json
      }.to change { organization.accounts.count }.by(1)

      expect(response).to have_http_status(:created)
      expect(json).to include(
        "name" => "Larissa Prado",
        "email" => "larissa@exemplo.com.br",
        "phone" => "5511912345678",
        "role" => "member",
        "setupOnly" => true,
        "organizationId" => organization.id
      )

      post "/login", params: { session: { email: "larissa@exemplo.com.br", password: "carrossel123" } }
      expect(response).to have_http_status(:created)
    end

    it "liga grupo e departamentos na criação" do
      team = create(:team, organization: organization)

      post "/users",
        params: { user: valid.merge(accessRoleId: manager_role.id, teamIds: [ team.id ]) },
        headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:created)
      expect(json).to include("accessRoleId" => manager_role.id, "teamIds" => [ team.id ])
      expect(json["permissions"]["core_settings"]).to eq("all")
    end

    it "exige core_settings" do
      headers = auth_headers(attendant)

      expect {
        post "/users", params: { user: valid }, headers: headers, as: :json
      }.not_to change(Account, :count)

      expect(response).to have_http_status(:forbidden)
      expect(json.dig("error", "code")).to eq("forbidden")
    end

    it "deixa quem tem core_settings criar pessoas, mesmo sem ser dono" do
      post "/users", params: { user: valid }, headers: auth_headers(manager), as: :json

      expect(response).to have_http_status(:created)
    end

    it "não deixa quem não é dono criar outro dono" do
      headers = auth_headers(manager)

      expect {
        post "/users", params: { user: valid.merge(role: "owner") }, headers: headers, as: :json
      }.not_to change(Account, :count)

      expect(response).to have_http_status(:forbidden)
    end

    it "deixa o dono criar outro dono" do
      post "/users", params: { user: valid.merge(role: "owner") }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:created)
      expect(json["role"]).to eq("owner")
    end

    it "responde 422 com os campos inválidos" do
      post "/users", params: { user: { name: "", email: "sem-arroba", password: "curta" } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("unprocessable")
      expect(json.dig("error", "details").keys).to include("name", "email", "password")
    end

    it "exige senha" do
      post "/users", params: { user: valid.except(:password) }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "details")).to have_key("password")
    end

    it "confere a confirmação da senha, quando vem" do
      post "/users", params: { user: valid.merge(passwordConfirmation: "outra-coisa") }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("passwordConfirmation")
    end

    it "recusa e-mail em uso, aqui ou em outra organização, com código próprio" do
      post "/users", params: { user: valid.merge(email: stranger.email) }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("emailTaken")
      expect(json.dig("error", "field")).to eq("email")
    end

    it "não aceita grupo de outra organização" do
      foreign_role = other_organization.access_roles.first

      post "/users", params: { user: valid.merge(accessRoleId: foreign_role.id) }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("accessRoleId")
    end

    it "não aceita departamento de outra organização" do
      foreign_team = create(:team, organization: other_organization)

      expect {
        post "/users", params: { user: valid.merge(teamIds: [ foreign_team.id ]) }, headers: auth_headers(owner), as: :json
      }.not_to change(Account, :count)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("invalidTeam")
      expect(json.dig("error", "field")).to eq("teamIds")
    end
  end

  describe "PATCH /users/:id" do
    it "edita nome, telefone, grupo, departamentos e papel" do
      team = create(:team, organization: organization)

      patch "/users/#{attendant.id}",
        params: { user: { name: "Camila R.", phone: "5511900000000", accessRoleId: manager_role.id,
                  teamIds: [ team.id ], setupOnly: true } },
        headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include(
        "name" => "Camila R.", "phone" => "5511900000000", "accessRoleId" => manager_role.id,
        "teamIds" => [ team.id ], "setupOnly" => true
      )
    end

    it "troca os departamentos: os novos entram, os antigos saem" do
      old_team = create(:team, organization: organization)
      new_team = create(:team, organization: organization)
      create(:team_membership, team: old_team, account: attendant)

      patch "/users/#{attendant.id}", params: { user: { teamIds: [ new_team.id ] } }, headers: auth_headers(owner), as: :json

      expect(json["teamIds"]).to eq([ new_team.id ])
      expect(attendant.reload.teams).to contain_exactly(new_team)
    end

    # Na origem o campo aceitava nulo. Aqui a coluna não aceita, e não pode virar 500.
    it "trata setupOnly nulo como falso" do
      attendant.update!(setup_only: true)

      patch "/users/#{attendant.id}", params: { user: { setupOnly: nil } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:ok)
      expect(json["setupOnly"]).to be(false)
    end

    it "não mexe nos departamentos se a chave não vier, e limpa com lista vazia" do
      team = create(:team, organization: organization)
      create(:team_membership, team: team, account: attendant)

      patch "/users/#{attendant.id}", params: { user: { name: "Camila R." } }, headers: auth_headers(owner), as: :json
      expect(json["teamIds"]).to eq([ team.id ])

      patch "/users/#{attendant.id}", params: { user: { teamIds: [] } }, headers: auth_headers(owner), as: :json
      expect(json["teamIds"]).to eq([])
    end

    it "tira a pessoa do grupo com null" do
      patch "/users/#{attendant.id}", params: { user: { accessRoleId: nil } }, headers: auth_headers(owner), as: :json

      expect(json["accessRoleId"]).to be_nil
      expect(attendant.reload.access_role).to be_nil
    end

    it "promove a dono e o dono pode deixar de ser dono, se sobrar outro" do
      patch "/users/#{attendant.id}", params: { user: { role: "owner" } }, headers: auth_headers(owner), as: :json
      expect(json["role"]).to eq("owner")

      patch "/users/#{owner.id}", params: { user: { role: "member" } }, headers: auth_headers(owner), as: :json
      expect(response).to have_http_status(:ok)
      expect(json["role"]).to eq("member")
    end

    it "não deixa a organização sem dono" do
      patch "/users/#{owner.id}", params: { user: { role: "member" } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("lastOwner")
      expect(owner.reload).to be_owner
    end

    it "dono revogado não conta como dono restante" do
      other_owner = create(:account, organization: organization, role: "owner")
      other_owner.revoke!

      patch "/users/#{owner.id}", params: { user: { role: "member" } }, headers: auth_headers(owner), as: :json

      expect(json.dig("error", "code")).to eq("lastOwner")
    end

    it "quem não é dono não mexe no dono" do
      patch "/users/#{owner.id}", params: { user: { name: "Outro Nome" } }, headers: auth_headers(manager), as: :json

      expect(response).to have_http_status(:forbidden)
      expect(owner.reload.name).to eq("Marina Duarte")
    end

    it "quem não é dono não promove ninguém a dono" do
      patch "/users/#{attendant.id}", params: { user: { role: "owner" } }, headers: auth_headers(manager), as: :json

      expect(response).to have_http_status(:forbidden)
      expect(attendant.reload).not_to be_owner
    end

    it "exige core_settings" do
      patch "/users/#{manager.id}", params: { user: { name: "Outro Nome" } }, headers: auth_headers(attendant), as: :json

      expect(response).to have_http_status(:forbidden)
    end

    it "responde 404 para gente de outra organização" do
      patch "/users/#{stranger.id}", params: { user: { name: "Invadido" } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:not_found)
      expect(stranger.reload.name).to eq("Pessoa de Fora")
    end

    it "responde 422 com o campo inválido e não grava" do
      patch "/users/#{attendant.id}", params: { user: { name: "" } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("name")
      expect(attendant.reload.name).to eq("Camila Rocha")
    end

    it "recusa e-mail em uso com código próprio" do
      patch "/users/#{attendant.id}", params: { user: { email: stranger.email } }, headers: auth_headers(owner), as: :json

      expect(json.dig("error", "code")).to eq("emailTaken")
    end

    describe "senha" do
      it "troca a senha de outra pessoa e derruba as sessões dela" do
        session = Session.start!(attendant)

        patch "/users/#{attendant.id}", params: { user: { password: "outra-senha-boa" } }, headers: auth_headers(owner), as: :json

        expect(response).to have_http_status(:ok)
        expect(attendant.reload.authenticate("outra-senha-boa")).to be_truthy
        expect(Session.authenticate(session.token)).to be_nil
      end

      it "ignora senha em branco: é a tela de edição sem ninguém querer trocar" do
        session = Session.start!(attendant)

        patch "/users/#{attendant.id}",
          params: { user: { name: "Camila R.", password: "", passwordConfirmation: "" } },
          headers: auth_headers(owner), as: :json

        expect(response).to have_http_status(:ok)
        expect(attendant.reload.authenticate("carrossel123")).to be_truthy
        expect(Session.authenticate(session.token)).to be_present
      end

      it "não troca a própria senha por aqui: em /profile a senha atual é exigida" do
        patch "/users/#{owner.id}", params: { user: { password: "outra-senha-boa" } }, headers: auth_headers(owner), as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("ownPasswordInProfile")
        expect(json.dig("error", "field")).to eq("password")
        expect(owner.reload.authenticate("carrossel123")).to be_truthy
      end
    end
  end

  describe "POST /users/:id/revoke" do
    it "corta o acesso sem apagar: sessão cai, entrar é recusado" do
      session = Session.start!(attendant)

      post "/users/#{attendant.id}/revoke", headers: auth_headers(owner)

      expect(response).to have_http_status(:ok)
      expect(json["revokedAt"]).to be_a(Integer)
      expect(Account.exists?(attendant.id)).to be(true)
      expect(Session.authenticate(session.token)).to be_nil

      post "/login", params: { session: { email: attendant.email, password: "carrossel123" } }
      expect(response).to have_http_status(:unauthorized)
      expect(json.dig("error", "code")).to eq("accessRevoked")
    end

    it "só revela a revogação a quem acerta a senha" do
      attendant.revoke!

      post "/login", params: { session: { email: attendant.email, password: "palpite-errado" } }

      expect(json.dig("error", "code")).to eq("wrongPassword")
    end

    it "derruba o WebSocket que já estava aberto" do
      expect {
        post "/users/#{attendant.id}/revoke", headers: auth_headers(owner)
      }.to have_broadcasted_to("action_cable/#{attendant.to_gid_param}")
        .with(type: "disconnect", reconnect: false)
    end

    it "é idempotente: mantém a data original" do
      attendant.revoke!(at: 2.days.ago)
      original = attendant.reload.revoked_at

      post "/users/#{attendant.id}/revoke", headers: auth_headers(owner)

      expect(response).to have_http_status(:ok)
      expect(attendant.reload.revoked_at).to be_within(1.second).of(original)
    end

    it "exige core_settings" do
      post "/users/#{manager.id}/revoke", headers: auth_headers(attendant)

      expect(response).to have_http_status(:forbidden)
      expect(manager.reload).not_to be_revoked
    end

    it "quem não é dono não revoga o dono" do
      post "/users/#{owner.id}/revoke", headers: auth_headers(manager)

      expect(response).to have_http_status(:forbidden)
      expect(owner.reload).not_to be_revoked
    end

    it "o único dono não pode se revogar: a organização ficaria sem dono" do
      post "/users/#{owner.id}/revoke", headers: auth_headers(owner)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("lastOwner")
    end

    it "ninguém revoga o próprio acesso" do
      create(:account, organization: organization, role: "owner")

      post "/users/#{owner.id}/revoke", headers: auth_headers(owner)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("cannotRevokeSelf")
      expect(owner.reload).not_to be_revoked
    end

    it "um dono pode revogar outro dono" do
      other_owner = create(:account, organization: organization, role: "owner")

      post "/users/#{other_owner.id}/revoke", headers: auth_headers(owner)

      expect(response).to have_http_status(:ok)
      expect(other_owner.reload).to be_revoked
    end

    it "responde 404 para gente de outra organização" do
      post "/users/#{stranger.id}/revoke", headers: auth_headers(owner)

      expect(response).to have_http_status(:not_found)
      expect(stranger.reload).not_to be_revoked
    end
  end

  describe "POST /users/:id/restore" do
    before { attendant.revoke! }

    it "devolve o acesso" do
      post "/users/#{attendant.id}/restore", headers: auth_headers(owner)

      expect(response).to have_http_status(:ok)
      expect(json["revokedAt"]).to be_nil

      post "/login", params: { session: { email: attendant.email, password: "carrossel123" } }
      expect(response).to have_http_status(:created)
    end

    it "exige core_settings" do
      post "/users/#{attendant.id}/restore", headers: auth_headers(create(:account, organization: organization, role: "member"))

      expect(response).to have_http_status(:forbidden)
    end

    it "quem não é dono não restaura o dono" do
      other_owner = create(:account, organization: organization, role: "owner")
      other_owner.revoke!

      post "/users/#{other_owner.id}/restore", headers: auth_headers(manager)

      expect(response).to have_http_status(:forbidden)
      expect(other_owner.reload).to be_revoked
    end

    it "responde 404 para gente de outra organização" do
      post "/users/#{stranger.id}/restore", headers: auth_headers(owner)

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "DELETE /users/:id" do
    it "apaga a pessoa e tudo que é só dela" do
      device = create(:push_device, account: attendant)
      notice = create(:account_notice, account: attendant)
      other_notice = create(:account_notice, account: owner)

      delete "/users/#{attendant.id}", headers: auth_headers(owner)

      expect(response).to have_http_status(:no_content)
      expect(Account.exists?(attendant.id)).to be(false)
      expect(PushDevice.exists?(device.id)).to be(false)
      expect(AccountNotice.where(id: notice.id).exists?).to be(false)
      expect(AccountNotice.where(id: other_notice.id).exists?).to be(true)
    end

    it "exige core_settings" do
      delete "/users/#{manager.id}", headers: auth_headers(attendant)

      expect(response).to have_http_status(:forbidden)
      expect(Account.exists?(manager.id)).to be(true)
    end

    it "quem não é dono não apaga o dono" do
      delete "/users/#{owner.id}", headers: auth_headers(manager)

      expect(response).to have_http_status(:forbidden)
      expect(Account.exists?(owner.id)).to be(true)
    end

    it "não apaga o único dono" do
      delete "/users/#{owner.id}", headers: auth_headers(owner)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("lastOwner")
    end

    it "ninguém apaga a própria conta por aqui" do
      create(:account, organization: organization, role: "owner")

      delete "/users/#{owner.id}", headers: auth_headers(owner)

      expect(json.dig("error", "code")).to eq("cannotDeleteSelf")
      expect(Account.exists?(owner.id)).to be(true)
    end

    it "responde 404 para gente de outra organização" do
      delete "/users/#{stranger.id}", headers: auth_headers(owner)

      expect(response).to have_http_status(:not_found)
      expect(Account.exists?(stranger.id)).to be(true)
    end
  end

  it "responde no idioma da requisição" do
    patch "/users/#{owner.id}", params: { user: { role: "member" } },
      headers: auth_headers(owner).merge("Accept-Language" => "en"), as: :json

    expect(json.dig("error", "message")).to eq("The organization needs at least one owner with access.")
  end
end
