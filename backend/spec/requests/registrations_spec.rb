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
end
