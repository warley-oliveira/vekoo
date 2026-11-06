require "rails_helper"

RSpec.describe "Alertas da organização", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization, role: "owner") }
  let(:attendant) { create(:account, organization: organization, role: "member") }
  let(:other_organization) { create(:organization) }

  it "exige sessão" do
    get "/alerts"
    expect(response).to have_http_status(:unauthorized)

    get "/alerts/details"
    expect(response).to have_http_status(:unauthorized)

    post "/alerts/resolve", params: { originType: "Connector", originId: "1" }, as: :json
    expect(response).to have_http_status(:unauthorized)
  end

  describe "GET /alerts" do
    it "conta os ativos por categoria, para os badges do menu" do
      create_list(:organization_alert, 2, organization: organization, category: "connectors")
      create(:organization_alert, organization: organization, category: "webhooks", origin_type: "Hook")
      create(:organization_alert, organization: organization, category: "webhooks", origin_type: "Hook", resolved_at: 1.hour.ago)

      get "/alerts", headers: auth_headers(attendant)

      expect(response).to have_http_status(:ok)
      expect(json).to eq("badges" => { "connectors" => 2, "webhooks" => 1 })
    end

    it "não conta alerta de outra organização" do
      create(:organization_alert, organization: other_organization)

      get "/alerts", headers: auth_headers(owner)

      expect(json).to eq("badges" => {})
    end
  end

  describe "GET /alerts/details" do
    it "lista os ativos, do mais novo ao mais antigo" do
      old = create(:organization_alert, organization: organization, created_at: 2.days.ago)
      recent = create(:organization_alert, organization: organization, created_at: 1.hour.ago)
      create(:organization_alert, organization: organization, resolved_at: 1.minute.ago)

      get "/alerts/details", headers: auth_headers(attendant)

      expect(response).to have_http_status(:ok)
      expect(json["alerts"].map { |a| a["id"] }).to eq([ recent.id, old.id ])
      expect(json["alerts"].first).to include(
        "category" => "connectors",
        "severity" => "error",
        "originType" => "Connector",
        "originId" => recent.origin_id,
        "originName" => "WhatsApp da loja",
        "code" => "connector_disconnected",
        "message" => "A integração \"WhatsApp da loja\" foi desconectada.",
        "metadata" => {}
      )
      expect(json["alerts"].first["createdAt"]).to be_a(Integer)
      expect(json["meta"]).to include("total" => 2)
    end

    it "filtra por categoria" do
      create(:organization_alert, organization: organization, category: "connectors")
      hook = create(:organization_alert, organization: organization, category: "webhooks")

      get "/alerts/details", params: { category: "webhooks" }, headers: auth_headers(owner)

      expect(json["alerts"].map { |a| a["id"] }).to eq([ hook.id ])
    end

    it "não mostra alerta de outra organização" do
      create(:organization_alert, organization: other_organization)

      get "/alerts/details", headers: auth_headers(owner)

      expect(json["alerts"]).to be_empty
    end

    it "traduz a frase padrão para o idioma da requisição, e não a de quem levantou o alerta" do
      create(:organization_alert, organization: organization)

      get "/alerts/details", headers: auth_headers(owner).merge("Accept-Language" => "en")

      expect(json["alerts"].first["message"]).to eq("The integration \"WhatsApp da loja\" was disconnected.")
    end

    it "mantém o texto próprio de quem levantou" do
      create(:organization_alert, organization: organization, message: "Template rejeitado pela Meta")

      get "/alerts/details", headers: auth_headers(owner).merge("Accept-Language" => "en")

      expect(json["alerts"].first["message"]).to eq("Template rejeitado pela Meta")
    end
  end

  describe "POST /alerts/resolve" do
    let!(:disconnected) do
      create(:organization_alert, organization: organization, origin_id: "conector-1", code: "connector_disconnected")
    end
    let!(:quality) do
      create(:organization_alert, organization: organization, origin_id: "conector-1", code: "low_quality")
    end

    it "resolve só o código pedido e devolve os badges atualizados" do
      post "/alerts/resolve",
        params: { originType: "Connector", originId: "conector-1", code: "low_quality" },
        headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to eq("resolved" => 1, "badges" => { "connectors" => 1 })
      expect(quality.reload.resolved_at).to be_present
      expect(disconnected.reload.resolved_at).to be_nil
    end

    it "sem código, resolve tudo que vier daquela origem" do
      post "/alerts/resolve", params: { originType: "Connector", originId: "conector-1" }, headers: auth_headers(owner), as: :json

      expect(json).to eq("resolved" => 2, "badges" => {})
    end

    it "transmite os badges novos" do
      headers = auth_headers(owner)

      expect {
        post "/alerts/resolve", params: { originType: "Connector", originId: "conector-1" }, headers: headers, as: :json
      }.to have_broadcasted_to("org:#{organization.id}:alerts").with(badges: {})
    end

    it "não resolve alerta de outra organização" do
      foreign = create(:organization_alert, organization: other_organization, origin_id: "conector-1")

      post "/alerts/resolve", params: { originType: "Connector", originId: "conector-1" }, headers: auth_headers(owner), as: :json

      expect(foreign.reload.resolved_at).to be_nil
    end

    it "exige core_settings: quem não chega nas telas de configuração não cala alerta" do
      post "/alerts/resolve", params: { originType: "Connector", originId: "conector-1" }, headers: auth_headers(attendant), as: :json

      expect(response).to have_http_status(:forbidden)
      expect(disconnected.reload.resolved_at).to be_nil
    end

    it "responde 400 sem a origem" do
      post "/alerts/resolve", params: { originType: "Connector" }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "code")).to eq("parameterMissing")
      expect(json.dig("error", "field")).to eq("originId")
    end
  end
end
