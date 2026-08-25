require "rails_helper"

RSpec.describe "Sessões", type: :request do
  let!(:account) do
    create(:account, email: "marina.duarte@exemplo.com.br", password: "carrossel123")
  end

  describe "POST /login" do
    it "abre a sessão e devolve conta, organização e créditos" do
      post "/login", params: { session: { email: account.email, password: "carrossel123" } }, as: :json

      expect(response).to have_http_status(:created)
      expect(json["token"]).to be_present
      expect(json["account"]).to include("email" => account.email, "role" => "owner")
      expect(json["organization"]).to include("id" => account.organization_id, "plan" => "free")
      expect(json["credits"]).to include("total" => 50, "used" => 0, "left" => 50)
    end

    it "aceita o e-mail escrito de qualquer jeito" do
      post "/login", params: { session: { email: " MARINA.Duarte@Exemplo.com.BR ", password: "carrossel123" } }, as: :json

      expect(response).to have_http_status(:created)
    end

    it "não entrega senha nem resumo de token na resposta" do
      post "/login", params: { session: { email: account.email, password: "carrossel123" } }, as: :json

      expect(response.body).not_to include("carrossel123")
      expect(response.body).not_to include("password")
      expect(response.body).not_to include("tokenDigest")
    end

    it "responde emailNotFound quando não existe conta" do
      post "/login", params: { session: { email: "ninguem@exemplo.com.br", password: "x" } }, as: :json

      expect(response).to have_http_status(:unauthorized)
      expect(json["error"]).to include("code" => "emailNotFound", "field" => "email")
    end

    it "responde wrongPassword quando a senha não bate" do
      post "/login", params: { session: { email: account.email, password: "errada" } }, as: :json

      expect(response).to have_http_status(:unauthorized)
      expect(json["error"]).to include("code" => "wrongPassword", "field" => "password")
    end

    it "escreve a mensagem no idioma pedido, mantendo o código" do
      post "/login?locale=en", params: { session: { email: account.email, password: "errada" } }, as: :json

      expect(json["error"]["code"]).to eq("wrongPassword")
      expect(json["error"]["message"]).to eq("Wrong password. Try again.")
    end

    it "guarda só o resumo do token" do
      post "/login", params: { session: { email: account.email, password: "carrossel123" } }, as: :json

      token = json["token"]
      expect(Session.last.token_digest).to eq(Digest::SHA256.hexdigest(token))
      expect(Session.pluck(:token_digest)).not_to include(token)
    end
  end

  describe "GET /me" do
    it "devolve a sessão de quem está com o token" do
      get "/me", headers: auth_headers(account)

      expect(response).to have_http_status(:ok)
      expect(json["account"]["id"]).to eq(account.id)
      expect(json).not_to have_key("token")
    end

    it "recusa sem token" do
      get "/me"

      expect(response).to have_http_status(:unauthorized)
      expect(json["error"]["code"]).to eq("unauthorized")
    end

    it "recusa token vencido" do
      session = Session.start!(account)
      session.update!(expires_at: 1.minute.ago)

      get "/me", headers: { "Authorization" => "Bearer #{session.token}" }

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "DELETE /logout" do
    it "encerra a sessão" do
      headers = auth_headers(account)

      delete "/logout", headers: headers
      expect(response).to have_http_status(:no_content)

      get "/me", headers: headers
      expect(response).to have_http_status(:unauthorized)
    end
  end
end
