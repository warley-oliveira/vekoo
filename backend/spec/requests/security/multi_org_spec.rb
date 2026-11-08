require "rails_helper"

# A organização vem do vínculo da aba (`X-Account: <hashid>`), conferido contra a pessoa da sessão.
# Ninguém alcança organização onde não tem vínculo ativo, por hashid nem por UUID; o suporte do
# Vekoo entra em qualquer uma, e cada entrada fica registrada.
RSpec.describe "Multi-organização e suporte", type: :request do
  let(:organization) { create(:organization, name: "Marina Duarte Conteúdo") }
  let(:clinic) { create(:organization, name: "Clínica Bem Viver") }
  let(:marina) { create(:account, organization: organization, role: "owner", name: "Marina Duarte") }
  let!(:marina_at_clinic) { create(:account, organization: clinic, user: marina.user, role: "member") }
  let(:outsider) { create(:account, organization: create(:organization), role: "owner") }
  let(:master) { create(:user, :master, name: "Suporte", email: "suporte@vekoo.com.br") }

  def bearer(user)
    { "Authorization" => "Bearer #{Session.start!(user).token}" }
  end

  describe "a mesma pessoa em duas organizações" do
    it "cada cabeçalho vê só a sua organização" do
      headers = bearer(marina.user)

      get "/organization", headers: headers.merge("X-Account" => marina.hashid)
      expect(json["name"]).to eq("Marina Duarte Conteúdo")

      get "/organization", headers: headers.merge("X-Account" => marina_at_clinic.hashid)
      expect(json["name"]).to eq("Clínica Bem Viver")
    end

    it "sem cabeçalho, com duas organizações, pede para escolher" do
      get "/organization", headers: bearer(marina.user)

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "code")).to eq("accountRequired")
    end

    it "sem cabeçalho, com uma organização só, usa ela" do
      get "/organization", headers: bearer(outsider.user)

      expect(response).to have_http_status(:ok)
      expect(json["id"]).to eq(outsider.organization_id)
    end

    it "/me lista as organizações e traz a da aba" do
      get "/me", headers: bearer(marina.user).merge("X-Account" => marina_at_clinic.hashid)

      expect(json["accounts"].map { |a| a["hashid"] }).to contain_exactly(marina.hashid, marina_at_clinic.hashid)
      expect(json.dig("account", "hashid")).to eq(marina_at_clinic.hashid)
      expect(json.dig("organization", "name")).to eq("Clínica Bem Viver")
      expect(json["user"]).to include("email" => marina.email, "master" => false)
      expect(json.dig("account", "hashid")).not_to eq(marina_at_clinic.number.to_s)
    end

    it "/me sem cabeçalho, com duas organizações, não escolhe por ninguém" do
      get "/me", headers: bearer(marina.user)

      expect(response).to have_http_status(:ok)
      expect(json["account"]).to be_nil
      expect(json["accounts"].size).to eq(2)
    end

    it "o login devolve as organizações, sem escolher quando há mais de uma" do
      post "/login", params: { session: { email: marina.email, password: "carrossel123" } }, as: :json

      expect(response).to have_http_status(:created)
      expect(json["accounts"].size).to eq(2)
      expect(json["account"]).to be_nil
    end
  end

  describe "quem não tem vínculo" do
    it "recebe 404 pelo hashid da organização de outra pessoa, igual a um hashid que não existe" do
      get "/organization", headers: bearer(outsider.user).merge("X-Account" => marina.hashid)
      foreign = [ response.status, json.dig("error", "code") ]

      get "/organization", headers: bearer(outsider.user).merge("X-Account" => "zzzzzzzz")
      missing = [ response.status, json.dig("error", "code") ]

      expect(foreign).to eq([ 404, "accountNotFound" ])
      expect(missing).to eq(foreign)
    end

    it "não alcança nada com o UUID do vínculo ou da organização no cabeçalho" do
      [ marina.id, organization.id, marina.number.to_s ].each do |value|
        get "/users", headers: bearer(outsider.user).merge("X-Account" => value)

        expect(response).to have_http_status(:not_found)
      end
    end

    it "não vê as pessoas de outra organização em nenhuma rota de leitura" do
      get "/users", headers: bearer(outsider.user).merge("X-Account" => outsider.hashid)

      expect(json["users"].map { |u| u["id"] }).not_to include(marina.id)
    end
  end

  describe "vínculo revogado" do
    it "perde o acesso àquela organização e continua na outra" do
      marina_at_clinic.revoke!
      headers = bearer(marina.user)

      get "/organization", headers: headers.merge("X-Account" => marina_at_clinic.hashid)
      expect(response).to have_http_status(:forbidden)
      expect(json.dig("error", "code")).to eq("accountRevoked")

      get "/organization", headers: headers.merge("X-Account" => marina.hashid)
      expect(response).to have_http_status(:ok)
    end

    it "derruba o WebSocket da organização revogada" do
      expect(ActionCable.server.remote_connections).to receive(:where).with(current_account: marina_at_clinic).and_call_original
      marina_at_clinic.revoke!
    end

    it "sem nenhum vínculo ativo, a sessão cai e o login explica" do
      token = Session.start!(outsider.user).token
      outsider.update_column(:role, "member")
      create(:account, organization: outsider.organization, role: "owner")
      outsider.revoke!

      get "/me", headers: { "Authorization" => "Bearer #{token}" }
      expect(json.dig("error", "code")).to eq("accessRevoked")

      post "/login", params: { session: { email: outsider.email, password: "carrossel123" } }, as: :json
      expect(json.dig("error", "code")).to eq("accessRevoked")
    end
  end

  describe "ninguém vira suporte pela API" do
    it "ignora `master` no perfil, no cadastro e em /users" do
      headers = auth_headers(marina)

      patch "/profile", params: { profile: { name: "Marina", master: true } }, headers: headers, as: :json
      post "/users", params: { user: { name: "Nova Pessoa", email: "nova@exemplo.com.br", password: "carrossel123", master: true } },
        headers: headers, as: :json
      post "/signup", params: { account: { name: "Outra", email: "outra@exemplo.com.br", password: "carrossel123",
                                           organizationName: "Outra Org", master: true } }, as: :json

      expect(User.where(master: true)).to be_empty
    end

    it "quem não é suporte não acha as rotas do suporte" do
      get "/support/organizations", headers: bearer(marina.user)
      expect(response).to have_http_status(:not_found)

      post "/support/organizations/#{clinic.id}/enter", headers: bearer(marina.user)
      expect(response).to have_http_status(:not_found)
      expect(Account.where(support: true)).to be_empty
    end
  end

  describe "o suporte do Vekoo" do
    it "acha a organização e entra, com tudo liberado e a entrada registrada" do
      headers = bearer(master)

      get "/support/organizations", params: { q: "marina duarte" }, headers: headers
      expect(json["organizations"].map { |o| o["name"] }).to include("Marina Duarte Conteúdo")

      expect {
        post "/support/organizations/#{organization.id}/enter", headers: headers.merge("User-Agent" => "Teste")
      }.to change(SupportAccess, :count).by(1)
      hashid = json["hashid"]
      expect(json).to include("support" => true)

      access = SupportAccess.sole
      expect(access).to have_attributes(user_id: master.id, organization_id: organization.id, user_agent: "Teste")
      expect(access.ip_address).to be_present

      get "/me", headers: headers.merge("X-Account" => hashid)
      expect(json.dig("account", "permissions").values.uniq).to eq([ "all" ])
      expect(json.dig("account", "name")).to eq("Suporte Vekoo")

      get "/users", params: { status: "all" }, headers: headers.merge("X-Account" => hashid)
      expect(json["users"].map { |u| u["id"] }).to eq([ marina.id ])
      expect(json["meta"]["total"]).to eq(1)
    end

    it "busca sem acento e pelo e-mail de quem participa" do
      marina_at_clinic

      get "/support/organizations", params: { q: "clinica" }, headers: bearer(master)
      expect(json["organizations"].map { |o| o["name"] }).to eq([ "Clínica Bem Viver" ])

      get "/support/organizations", params: { q: marina.email.upcase }, headers: bearer(master)
      expect(json["organizations"].map { |o| o["name"] }).to contain_exactly("Marina Duarte Conteúdo", "Clínica Bem Viver")
    end

    it "entra de novo pelo mesmo vínculo de suporte" do
      first = Support::Entry.call(user: master, organization: organization)
      again = Support::Entry.call(user: master, organization: organization)

      expect(again).to eq(first)
      expect(organization.accounts).not_to include(first)
      expect(SupportAccess.count).to eq(2)
    end

    it "deixando de ser suporte, perde o vínculo de suporte na hora" do
      account = Support::Entry.call(user: master, organization: organization)
      master.update!(master: false)

      get "/organization", headers: bearer(master).merge("X-Account" => account.hashid)

      expect(response).to have_http_status(:not_found)
    end

    it "não aparece nos seletores de atribuição nem nas contagens" do
      Support::Entry.call(user: master, organization: organization)

      get "/chats/people", headers: auth_headers(marina)
      expect(json["people"].map { |p| p["name"] }).not_to include("Suporte Vekoo")

      get "/teams", headers: auth_headers(marina)
      expect(response).to have_http_status(:ok)
      expect(organization.accounts.count).to eq(1)
    end
  end
end
