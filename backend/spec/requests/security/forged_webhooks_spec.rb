require "rails_helper"

# Evolution e LeadChat não assinam o que mandam, e as rotas não têm sessão. Sem nada que só o
# provedor saiba, conhecer o id do conector bastava para falar em nome dele.
RSpec.describe "Webhook de provedor forjado", type: :request do
  include ActiveJob::TestHelper

  let(:organization) { create(:organization) }

  def expect_refused
    expect(response).to have_http_status(:not_found)
    expect(Inbound::ProcessWebhookJob).not_to have_been_enqueued
  end

  describe "Evolution" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization) }
    let(:codename) { "IWA-#{connector.id}" }

    # Um QR code da pessoa que forjou na tela de quem está conectando o canal: quem escaneia entrega o
    # próprio WhatsApp a ela.
    let(:fake_qr_code) { { event: "qrcode.updated", data: { qrcode: { base64: "QR-DE-QUEM-FORJOU" } } } }

    it "sem o token, não enfileira nada" do
      post "/inbound/evolution/#{codename}", params: fake_qr_code, as: :json

      expect_refused
    end

    it "com o token errado, também não" do
      post "/inbound/evolution/#{codename}?token=adivinhado", params: fake_qr_code, as: :json

      expect_refused
    end

    it "o token de outro conector não serve" do
      other = create(:connector_whatsapp_web, organization: create(:organization))

      post "/inbound/evolution/#{codename}?token=#{other.inbound_token}", params: fake_qr_code, as: :json

      expect_refused
    end

    # A mesma resposta de "não existe": a rota não confirma que aquele id é um conector.
    it "não conta que o conector existe" do
      post "/inbound/evolution/#{codename}", params: {}, as: :json
      with_id = response.status

      post "/inbound/evolution/IWA-#{BSON::ObjectId.new}", params: {}, as: :json

      expect(with_id).to eq(response.status)
    end

    it "o endereço que entregamos ao provedor funciona" do
      post connector.inbound_url(:evolution, codename).delete_prefix(Media::Storage.backend_url), params: fake_qr_code, as: :json

      expect(response).to have_http_status(:ok)
      expect(Inbound::ProcessWebhookJob).to have_been_enqueued.with("evolution", anything, codename)
    end
  end

  describe "LeadChat" do
    let(:connector) { create(:connector_lead_chat, organization: organization) }

    it "sem o token não passa" do
      post "/inbound/lead-chat/#{connector.id}/event", params: { text: "forjado" }, as: :json

      expect_refused
    end

    it "o endereço de `webhook_url` funciona" do
      post connector.webhook_url.delete_prefix(Media::Storage.backend_url), params: { text: "oi" }, as: :json

      expect(response).to have_http_status(:ok)
    end
  end

  describe "o token" do
    it "é fixo por conector e diferente entre eles" do
      one = create(:connector_lead_chat, organization: organization)
      other = create(:connector_lead_chat, organization: organization)

      expect(one.inbound_token).to eq(Connector::Base.find(one.id).inbound_token)
      expect(one.inbound_token).not_to eq(other.inbound_token)
    end

    # Só quem cola o endereço no painel do provedor precisa dele: é o caso do LeadChat, na criação.
    it "não sai na leitura do conector, que qualquer conta da organização faz" do
      [ create(:connector_whatsapp_web, organization: organization),
        create(:connector_lead_chat, organization: organization) ].each do |connector|
        expect(ConnectorSerializer.one(connector).to_json).not_to include(connector.inbound_token)
      end
    end
  end

  describe "assinatura da Meta" do
    let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }
    let(:forged) { { entry: [ { changes: [ { value: { messages: [ { id: "F1", text: { body: "forjado" } } ] } } ] } ] } }

    # Sem segredo em desenvolvimento não há o que conferir. Em produção, a variável esquecida não pode
    # virar uma rota aberta: era o que acontecia, e sem nenhum aviso.
    around do |example|
      with_env("META_APP_SECRET" => nil, "INSTAGRAM_APP_SECRET" => nil) { example.run }
    end

    context "em produção, sem o segredo configurado" do
      before { allow(Rails.env).to receive(:production?).and_return(true) }

      it "recusa o webhook do WhatsApp oficial" do
        post "/inbound/whatsapp-cloud/#{connector.id}", params: forged, as: :json

        expect(response).to have_http_status(:forbidden)
        expect(Inbound::ProcessWebhookJob).not_to have_been_enqueued
      end

      it "recusa o webhook de Instagram e Messenger" do
        post "/inbound/meta-messaging", params: forged, as: :json

        expect(response).to have_http_status(:forbidden)
        expect(Inbound::ProcessWebhookJob).not_to have_been_enqueued
      end
    end

    it "em desenvolvimento e teste, continua sem conferir" do
      post "/inbound/whatsapp-cloud/#{connector.id}", params: forged, as: :json

      expect(response).to have_http_status(:ok)
    end
  end
end
