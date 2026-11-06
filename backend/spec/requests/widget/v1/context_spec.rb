require "rails_helper"

RSpec.describe "Widget::V1::Context", type: :request do
  let(:connector) { create(:connector_web_widget) }
  let(:visitor_id) { "visitor-ctx-1" }
  let(:widget_headers) { { "Authorization" => "Bearer #{connector.issue_visitor_jwt(visitor_id)}" } }
  let(:context_params) { { page: { url: "https://loja.com/carrinho", title: "Carrinho" } } }

  def put_context(context = context_params)
    put "/widget/v1/context", params: { context: context }, headers: widget_headers, as: :json
  end

  def cards(chat)
    ChatMessage::Base.where(chat_id: chat.id, role_base_type: "widget-context")
  end

  describe "CORS" do
    it "libera PUT de qualquer origem, porque o widget roda no domínio do cliente" do
      options "/widget/v1/context",
              headers: {
                "Origin" => "https://loja-do-cliente.com",
                "Access-Control-Request-Method" => "PUT",
                "Access-Control-Request-Headers" => "authorization,content-type"
              }

      expect(response.headers["Access-Control-Allow-Origin"]).to eq("*")
      expect(response.headers["Access-Control-Allow-Methods"]).to include("PUT")
    end
  end

  describe "PUT /widget/v1/context" do
    it "responde 401 sem token" do
      put "/widget/v1/context", params: { context: context_params }, as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it "responde 401 com JWT assinado por outro conector" do
      other = create(:connector_web_widget)
      foreign = JWT.encode({ visitor_id: visitor_id, connector_id: connector.id.to_s, exp: 1.hour.from_now.to_i }, other.signing_secret, "HS256")

      put "/widget/v1/context", params: { context: context_params }, headers: { "Authorization" => "Bearer #{foreign}" }, as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it "responde 202 stored:false sem conversa, e não cria nenhuma" do
      put_context

      expect(response).to have_http_status(:accepted)
      expect(json["stored"]).to be(false)
      expect(Chat.where(connector_id: connector.id).count).to eq(0)
    end

    it "responde 422 com o corpo acima de 16 KB, antes de procurar a conversa" do
      put_context({ product: { description: "a" * (17 * 1024) } })

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("contextTooLarge")
    end

    context "com conversa do visitante" do
      let!(:chat) { create(:chat, connector: connector, external_id: visitor_id, audience_type: "web") }

      it "mescla o contexto higienizado na conversa" do
        put_context

        expect(response).to have_http_status(:ok)
        expect(json["stored"]).to be(true)

        chat.reload
        expect(chat.widget_context.dig("page", "url")).to eq("https://loja.com/carrinho")
        expect(chat.widget_context.dig("page", "captured_at")).to be_present
      end

      it "substitui as seções inteiras, mas acumula os eventos" do
        put_context({ page: { title: "A" }, events: [ { name: "view_a", at: "2026-01-01T00:00:00Z" } ] })
        put_context({ page: { title: "B" }, events: [ { name: "view_b", at: "2026-01-01T00:01:00Z" } ] })

        chat.reload
        expect(chat.widget_context.dig("page", "title")).to eq("B")
        expect(chat.widget_context["events"].map { |event| event["name"] }).to eq(%w[view_a view_b])
      end

      it "não converte as chaves: os dados são do site do cliente" do
        put_context({ product: { name: "Tênis", image_url: "https://cdn.loja.com/t.jpg", extra: { "corDoTenis" => "azul" } } })

        product = chat.reload.widget_context["product"]
        expect(product["image_url"]).to eq("https://cdn.loja.com/t.jpg")
        expect(product["extra"]).to eq("corDoTenis" => "azul")
      end

      it "grava o cartão de contexto quando o produto muda" do
        put_context({ product: { name: "Tênis Y", price: "99.90" } })

        expect(cards(chat).count).to eq(1)
        expect(cards(chat).first.content).to include("Tênis Y")
      end

      it "grava o cartão de contexto quando a identidade muda" do
        put_context({ visitor: { name: "Ana", email: "ana@ex.com" } })

        expect(cards(chat).count).to eq(1)
        expect(cards(chat).first.content).to include("identidade NÃO verificada")
      end

      it "não repete o cartão se o produto não mudou" do
        2.times { put_context({ product: { name: "Tênis Y" } }) }

        expect(cards(chat).count).to eq(1)
      end

      it "não grava cartão quando só a página muda" do
        put_context

        expect(cards(chat).count).to eq(0)
      end

      it "não grava cartão quando só chegam eventos" do
        put_context({ events: [ { name: "view_a" } ] })

        expect(cards(chat).count).to eq(0)
      end

      it "responde 202 quando nada aproveitável sobra" do
        put_context({ product: { "$where" => "x" } })

        expect(response).to have_http_status(:accepted)
        expect(json["stored"]).to be(false)
      end

      it "responde 202 sem contexto" do
        put "/widget/v1/context", params: {}, headers: widget_headers, as: :json

        expect(response).to have_http_status(:accepted)
        expect(json["stored"]).to be(false)
      end

      it "responde 422 com contexto grande demais" do
        put_context({ product: { description: "a" * 9_000 } })

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json.dig("error", "code")).to eq("contextTooLarge")
        expect(chat.reload.widget_context).to eq({})
      end

      it "aplica a identidade verificada aos dados de contato" do
        external_id = "cliente-42"
        hash = OpenSSL::HMAC.hexdigest("SHA256", connector.signing_secret, external_id)
        chat.set(user_name: "Visitante")

        put_context({ visitor: { external_id: external_id, name: "Ana", email: "ana@ex.com", hash: hash } })

        chat.reload
        expect(chat.user_name).to eq("Ana")
        expect(chat.custom_attributes["email"]).to eq("ana@ex.com")
        expect(chat.widget_context.dig("visitor", "verified")).to be(true)
        expect(chat.widget_context["visitor"]).not_to have_key("hash")
      end

      it "ignora a identidade sem o hash certo" do
        chat.set(user_name: "Visitante")

        put_context({ visitor: { external_id: "cliente-42", name: "Impostor", hash: "f" * 64 } })

        chat.reload
        expect(chat.user_name).to eq("Visitante")
        expect(chat.widget_context.dig("visitor", "verified")).to be(false)
      end
    end

    it "não toca na conversa de outro visitante" do
      other = create(:chat, connector: connector, external_id: "visitor-ctx-2")

      put_context

      expect(response).to have_http_status(:accepted)
      expect(other.reload.widget_context).to eq({})
    end
  end
end
