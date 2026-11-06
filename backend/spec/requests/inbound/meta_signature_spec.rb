require "rails_helper"

# A Meta assina o corpo dos webhooks. Sem conferir, bastaria conhecer o id de uma página, que é
# público, para injetar mensagem numa conversa e disparar fluxos.
RSpec.describe "Assinatura dos webhooks da Meta", type: :request do
  let(:connector) { create(:connector_messenger) }
  let(:cloud) { create(:connector_whatsapp_cloud) }
  let(:body) { { object: "page", entry: [ { id: connector.page_id, messaging: [] } ] }.to_json }

  def signature(secret, content = body)
    "sha256=#{OpenSSL::HMAC.hexdigest('SHA256', secret, content)}"
  end

  def post_webhook(path = "/inbound/meta-messaging", sign_with: nil)
    headers = { "Content-Type" => "application/json" }
    headers["X-Hub-Signature-256"] = signature(sign_with) if sign_with
    post path, params: body, headers: headers
  end

  def with_secrets(meta: nil, instagram: nil)
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("META_APP_SECRET").and_return(meta)
    allow(ENV).to receive(:[]).with("INSTAGRAM_APP_SECRET").and_return(instagram)
  end

  context "sem segredo configurado (desenvolvimento)" do
    before { with_secrets }

    it "aceita sem assinatura" do
      expect { post_webhook }.to have_enqueued_job(Inbound::ProcessWebhookJob)
      expect(response).to have_http_status(:ok)
    end
  end

  context "com o segredo do app" do
    before { with_secrets(meta: "segredo-meta") }

    it "aceita com a assinatura certa" do
      expect { post_webhook(sign_with: "segredo-meta") }.to have_enqueued_job(Inbound::ProcessWebhookJob)
      expect(response).to have_http_status(:ok)
    end

    it "recusa sem assinatura, sem enfileirar nada" do
      expect { post_webhook }.not_to have_enqueued_job(Inbound::ProcessWebhookJob)

      expect(response).to have_http_status(:forbidden)
      expect(json.dig("error", "code")).to eq("invalidSignature")
    end

    it "recusa com assinatura de outro segredo" do
      expect { post_webhook(sign_with: "outro") }.not_to have_enqueued_job(Inbound::ProcessWebhookJob)

      expect(response).to have_http_status(:forbidden)
    end

    it "recusa quando o corpo não é o assinado" do
      post "/inbound/meta-messaging",
           params: { object: "page", entry: [] }.to_json,
           headers: { "Content-Type" => "application/json", "X-Hub-Signature-256" => signature("segredo-meta") }

      expect(response).to have_http_status(:forbidden)
    end

    it "vale também no webhook do WhatsApp Cloud" do
      expect { post_webhook("/inbound/whatsapp-cloud/#{cloud.id}") }.not_to have_enqueued_job(Inbound::ProcessWebhookJob)
      expect(response).to have_http_status(:forbidden)

      expect { post_webhook("/inbound/whatsapp-cloud/#{cloud.id}", sign_with: "segredo-meta") }.to have_enqueued_job(Inbound::ProcessWebhookJob)
      expect(response).to have_http_status(:ok)
    end

    it "não atrapalha o desafio de verificação, que a Meta não assina" do
      get "/inbound/whatsapp-cloud/#{cloud.id}", params: { "hub.mode" => "subscribe", "hub.verify_token" => cloud.verification_token, "hub.challenge" => "42" }

      expect(response.body).to eq("42")
    end
  end

  context "com os dois apps (Instagram Login é outro app)" do
    before { with_secrets(meta: "segredo-meta", instagram: "segredo-instagram") }

    it "aceita a assinatura de qualquer um dos dois" do
      post_webhook(sign_with: "segredo-instagram")
      expect(response).to have_http_status(:ok)

      post_webhook(sign_with: "segredo-meta")
      expect(response).to have_http_status(:ok)
    end
  end
end
