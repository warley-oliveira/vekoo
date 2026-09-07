require "rails_helper"

# A única superfície da API que aceita palpite é a não autenticada. Estes
# exemplos exercitam o limite de verdade — por isso o cache precisa ser
# compartilhado (memory_store em teste, Redis em produção); com null_store eles
# passariam sem nunca ter limitado nada.
RSpec.describe "Limite de tentativas", type: :request do
  describe "POST /login" do
    let!(:account) { create(:account, email: "alvo@exemplo.com.br", password: "carrossel123") }

    it "corta quem fica adivinhando senha do mesmo e-mail" do
      6.times do
        post "/login", params: { session: { email: "alvo@exemplo.com.br", password: "errada" } }
      end

      expect(response).to have_http_status(:too_many_requests)
      expect(json.dig("error", "code")).to eq("tooManyRequests")
    end

    it "recusa mesmo com a senha certa depois de estourar o limite" do
      6.times do
        post "/login", params: { session: { email: "alvo@exemplo.com.br", password: "errada" } }
      end

      post "/login", params: { session: { email: "alvo@exemplo.com.br", password: "carrossel123" } }

      expect(response).to have_http_status(:too_many_requests)
    end

    it "não deixa um alvo derrubar a entrada de outra pessoa" do
      create(:account, email: "outro@exemplo.com.br", password: "carrossel123")
      6.times do
        post "/login", params: { session: { email: "alvo@exemplo.com.br", password: "errada" } }
      end

      post "/login", params: { session: { email: "outro@exemplo.com.br", password: "carrossel123" } }

      expect(response).to have_http_status(:created)
    end

    it "responde no idioma da requisição" do
      6.times do
        post "/login",
          params: { session: { email: "alvo@exemplo.com.br", password: "errada" } },
          headers: { "Accept-Language" => "en" }
      end

      expect(json.dig("error", "message")).to match(/Too many attempts/)
    end
  end

  describe "POST /signup" do
    it "corta a criação de contas em série" do
      6.times do |i|
        post "/signup", params: {
          account: {
            name: "Pessoa #{i}", email: "p#{i}@exemplo.com.br",
            password: "senha123456", organizationName: "Org #{i}"
          }
        }
      end

      expect(response).to have_http_status(:too_many_requests)
      # Cinco passaram; a sexta não criou nada.
      expect(Organization.count).to eq(5)
    end
  end

  describe "POST /password-resets" do
    it "corta quem usa o envio de link para incomodar alguém" do
      create(:account, email: "alvo@exemplo.com.br")

      6.times do
        post "/password-resets", params: { passwordReset: { email: "alvo@exemplo.com.br" } }
      end

      expect(response).to have_http_status(:too_many_requests)
      expect(PasswordReset.count).to eq(5)
    end
  end
end
