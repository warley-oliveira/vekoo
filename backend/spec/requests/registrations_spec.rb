require "rails_helper"

RSpec.describe "Criar conta", type: :request do
  def signup(overrides = {})
    payload = {
      name: "Bruno Tavares",
      email: "bruno@exemplo.com.br",
      password: "senha12345",
      organizationName: "Doma Store"
    }.merge(overrides)

    post "/signup", params: { account: payload }, as: :json
  end

  it "cria a organização e entra como dono, já com sessão aberta" do
    expect { signup }.to change(Organization, :count).by(1).and change(Account, :count).by(1)

    expect(response).to have_http_status(:created)
    expect(json["token"]).to be_present
    expect(json["account"]).to include("name" => "Bruno Tavares", "role" => "owner")
    expect(json["organization"]).to include("name" => "Doma Store", "plan" => "free")
    expect(json["credits"]).to include("total" => 50, "used" => 0)
  end

  it "põe o aviso de boas-vindas na conta nova" do
    signup

    organization = Organization.find(json["organization"]["id"])
    expect(organization.notifications.pluck(:key)).to eq([ "welcome" ])
    # A primeira marca nasce com a conta: é para o formulário dela que a
    # pessoa vai em seguida.
    expect(organization.brand_cores.count).to eq(1)
  end

  it "normaliza o e-mail" do
    signup(email: "  Bruno@Exemplo.COM.br ")

    expect(Account.last.email).to eq("bruno@exemplo.com.br")
  end

  it "recusa e-mail já cadastrado com o código que a tela conhece" do
    create(:account, email: "bruno@exemplo.com.br")

    expect { signup }.not_to change(Organization, :count)
    expect(response).to have_http_status(:unprocessable_content)
    expect(json["error"]).to include("code" => "emailTaken", "field" => "email")
  end

  it "aponta o campo do formulário certo para cada erro, todos de uma vez" do
    signup(password: "123", organizationName: "X")

    expect(response).to have_http_status(:unprocessable_content)
    # `organizationName`, não `name`: na tela são dois campos diferentes.
    expect(json["error"]["details"].keys).to contain_exactly("password", "organizationName")
    expect(json["error"]["field"]).to eq("password")
  end

  it "recusa e-mail malformado" do
    signup(email: "nao-e-email")

    expect(response).to have_http_status(:unprocessable_content)
    expect(json["error"]["details"]).to have_key("email")
  end

  it "não deixa organização órfã quando a conta não vale" do
    expect { signup(password: "123") }.not_to change(Organization, :count)
  end

  # Produção antes do lançamento: `config.x.signup_allowlist` vem de
  # SIGNUP_ALLOWLIST. Dev e test não definem a lista e ficam abertos.
  describe "com o cadastro fechado" do
    around do |example|
      previous = Rails.configuration.x.signup_allowlist
      Rails.configuration.x.signup_allowlist = " Bruno@Exemplo.com.br, socia@exemplo.com.br,,"
      example.run
    ensure
      Rails.configuration.x.signup_allowlist = previous
    end

    it "deixa entrar quem está na lista, sem diferença de maiúscula ou espaço" do
      expect { signup(email: " bruno@EXEMPLO.com.br") }.to change(Account, :count).by(1)
      expect(response).to have_http_status(:created)
    end

    it "recusa quem não está na lista com 403, sem criar nada" do
      expect { signup(email: "intrusa@exemplo.com.br") }.not_to change(Organization, :count)

      expect(response).to have_http_status(:forbidden)
      expect(json["error"]).to include("code" => "signupClosed", "field" => "email")
      expect(json["error"]["message"]).to eq(I18n.t("auth.signup_closed"))
    end

    it "fecha para todo mundo quando a lista está vazia" do
      Rails.configuration.x.signup_allowlist = ""

      expect { signup }.not_to change(Account, :count)
      expect(response).to have_http_status(:forbidden)
    end

    it "não muda nada para quem já tem conta: o login segue" do
      create(:account, email: "antiga@exemplo.com.br")

      post "/login", params: { session: { email: "antiga@exemplo.com.br", password: "carrossel123" } }, as: :json

      expect(response).to have_http_status(:created)
    end
  end
end
