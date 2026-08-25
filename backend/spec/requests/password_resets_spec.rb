require "rails_helper"

RSpec.describe "Nova senha", type: :request do
  let!(:account) { create(:account, email: "marina@exemplo.com.br", password: "carrossel123") }

  describe "POST /password-resets" do
    it "aceita e abre o pedido" do
      expect {
        post "/password-resets", params: { passwordReset: { email: account.email } }, as: :json
      }.to change(PasswordReset, :count).by(1)

      expect(response).to have_http_status(:accepted)
    end

    it "responde igual para e-mail que não existe — não vaza quem tem conta" do
      post "/password-resets", params: { passwordReset: { email: "ninguem@exemplo.com.br" } }, as: :json

      expect(response).to have_http_status(:accepted)
      expect(json["status"]).to eq("accepted")
      expect(PasswordReset.count).to eq(0)
    end
  end

  describe "PATCH /password-resets/:token" do
    def open_reset
      post "/password-resets", params: { passwordReset: { email: account.email } }, as: :json
      json["token"]
    end

    it "troca a senha e derruba as sessões abertas" do
      antiga = auth_headers(account)
      token = open_reset

      patch "/password-resets/#{token}", params: { passwordReset: { password: "novasenha123" } }, as: :json

      expect(response).to have_http_status(:no_content)
      expect(account.reload.authenticate("novasenha123")).to be_truthy

      get "/me", headers: antiga
      expect(response).to have_http_status(:unauthorized)
    end

    it "vale uma vez só" do
      token = open_reset
      patch "/password-resets/#{token}", params: { passwordReset: { password: "novasenha123" } }, as: :json

      patch "/password-resets/#{token}", params: { passwordReset: { password: "outrasenha123" } }, as: :json

      expect(response).to have_http_status(:not_found)
      expect(json["error"]["code"]).to eq("resetTokenInvalid")
    end

    it "recusa token vencido" do
      token = open_reset
      PasswordReset.last.update!(expires_at: 1.minute.ago)

      patch "/password-resets/#{token}", params: { passwordReset: { password: "novasenha123" } }, as: :json

      expect(response).to have_http_status(:not_found)
    end

    it "recusa senha curta demais" do
      token = open_reset

      patch "/password-resets/#{token}", params: { passwordReset: { password: "123" } }, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["details"]).to have_key("password")
    end
  end
end
