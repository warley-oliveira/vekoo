require "rails_helper"

# O IP do cliente é o que limita tentativa por padrão (`rate_limit`), e é ele que a sessão guarda.
# Em produção a requisição chega assim: pessoa -> Cloudflare -> kamal-proxy -> Puma.
RSpec.describe "IP do cliente", type: :request do
  let(:organization) { create(:organization) }
  let!(:account) { create(:account, organization: organization, password: "carrossel123") }

  def login(password: "carrossel123", headers: {})
    post "/login", params: { session: { email: account.email, password: password } }, headers: headers, as: :json
  end

  describe "cabeçalho Forwarded, escrito pelo cliente" do
    # O kamal-proxy acrescenta o X-Forwarded-For e deixa o Forwarded passar como veio.
    it "não escolhe o IP" do
      login(headers: { "Forwarded" => "for=198.51.100.77", "X-Forwarded-For" => "203.0.113.9" })

      expect(response).to have_http_status(:created)
      expect(Session.order(created_at: :desc).first.ip_address.to_s).to eq("203.0.113.9")
    end

    # Trocar o endereço a cada tentativa zerava o limite por IP: era só mandar outro cabeçalho. Um e-mail
    # por tentativa, para o limite por e-mail não ser quem barra.
    it "não escapa do limite por IP do login" do
      statuses = 12.times.map do |attempt|
        post "/login",
          params: { session: { email: "pessoa#{attempt}@exemplo.com.br", password: "errada123" } },
          headers: { "Forwarded" => "for=198.51.100.#{attempt + 1}", "X-Forwarded-For" => "203.0.113.9" },
          as: :json
        response.status
      end

      expect(statuses.last).to eq(429)
    end

    it "não escapa do limite de criar conta" do
      statuses = 7.times.map do |attempt|
        post "/signup",
          params: { account: { name: "Pessoa #{attempt}", email: "pessoa#{attempt}@exemplo.com.br", password: "carrossel123", organizationName: "Loja #{attempt}" } },
          headers: { "Forwarded" => "for=198.51.100.#{attempt + 1}", "X-Forwarded-For" => "203.0.113.9" },
          as: :json
        response.status
      end

      expect(statuses.last).to eq(429)
    end
  end

  describe "atrás da Cloudflare" do
    # Sem confiar nas faixas dela, o IP de todo mundo era o da borda: uma pessoa errando a senha cortava
    # o login de quem saísse pelo mesmo endereço da Cloudflare, e o limite por IP não limitava ninguém.
    it "o cliente é quem vem antes da borda" do
      login(headers: { "X-Forwarded-For" => "203.0.113.9, 173.245.48.10" })

      expect(Session.order(created_at: :desc).first.ip_address.to_s).to eq("203.0.113.9")
    end

    it "o que o cliente escreveu antes do próprio endereço não vale" do
      login(headers: { "X-Forwarded-For" => "198.51.100.77, 203.0.113.9, 173.245.48.10" })

      expect(Session.order(created_at: :desc).first.ip_address.to_s).to eq("203.0.113.9")
    end

    it "a faixa da Cloudflare também vale em IPv6" do
      login(headers: { "X-Forwarded-For" => "203.0.113.9, 2606:4700:4700::1111" })

      expect(Session.order(created_at: :desc).first.ip_address.to_s).to eq("203.0.113.9")
    end

    # Quem chega direto na origem (o firewall barra, mas isto não depende dele) é o último da fila.
    it "endereço fora da Cloudflare não é confiado" do
      login(headers: { "X-Forwarded-For" => "198.51.100.77, 203.0.113.9" })

      expect(Session.order(created_at: :desc).first.ip_address.to_s).to eq("203.0.113.9")
    end
  end
end
