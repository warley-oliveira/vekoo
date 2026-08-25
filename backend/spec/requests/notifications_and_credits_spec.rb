require "rails_helper"

RSpec.describe "Avisos e créditos", type: :request do
  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }

  describe "avisos" do
    it "lista do mais recente ao mais antigo, com a contagem de não lidos" do
      create(:notification, organization: organization, key: "welcome", notified_at: 6.days.ago, read: true)
      create(:notification, organization: organization, key: "templates", notified_at: 5.hours.ago)

      get "/notifications", headers: headers

      expect(json["notifications"].map { |n| n["key"] }).to eq(%w[templates welcome])
      expect(json["unread"]).to eq(1)
      # Só a chave de tradução — o texto é interface e nasce na tela.
      expect(json["notifications"].first.keys).to contain_exactly("id", "key", "at", "read")
    end

    it "marca tudo como lido" do
      create(:notification, organization: organization)

      post "/notifications/read-all", headers: headers

      expect(json["unread"]).to eq(0)
      expect(organization.notifications.unread).to be_empty
    end
  end

  describe "créditos" do
    it "mostra o saldo" do
      organization.update!(credits_used: 14)

      get "/credits", headers: headers

      expect(json).to eq("total" => 50, "used" => 14, "left" => 36)
    end

    it "consome" do
      post "/credits/consume", params: { amount: 5 }, headers: headers, as: :json

      expect(json).to include("used" => 5, "left" => 45)
    end

    it "recusa quando não há saldo, sem estourar o total" do
      organization.update!(credits_used: 48)

      post "/credits/consume", params: { amount: 5 }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["code"]).to eq("noCredits")
      expect(organization.reload.credits_used).to eq(48)
    end
  end
end
