require "rails_helper"

# O que na origem era configuração do assistente e aqui é da organização.
RSpec.describe "Configurações de automação", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization, role: "owner") }
  let(:member) { create(:account, organization: organization, role: "member", access_role: create(:access_role, :member, organization: organization)) }

  let(:business_work) do
    { days: [ { dayOfWeek: "1", enabled: "true", windows: [ { start: "09:00", end: "18:00" } ] } ] }
  end

  describe "GET /automation-settings" do
    it "exige sessão" do
      get "/automation-settings"

      expect(response).to have_http_status(:unauthorized)
    end

    it "traz os padrões, para qualquer conta da organização" do
      get "/automation-settings", headers: auth_headers(member)

      expect(response).to have_http_status(:ok)
      expect(json["automationSettings"]).to include(
        "automationEnabled" => true,
        "defaultAutomationEnabled" => true,
        "automationPausePeriod" => "disabled",
        "automationPauseTimeTo" => 1,
        "businessWorkEnabled" => false,
        "autoClearContextEnabled" => false,
        "autoClearContextInterval" => 48,
        "flowDebounceSeconds" => 3,
        "timezone" => organization.timezone
      )
    end
  end

  describe "PATCH /automation-settings" do
    it "exige sessão" do
      patch "/automation-settings", params: { automationEnabled: false }, as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it "exige permissão de configuração" do
      patch "/automation-settings", params: { automationEnabled: false }, headers: auth_headers(member), as: :json

      expect(response).to have_http_status(:forbidden)
      expect(organization.reload.automation_enabled?).to be(true)
    end

    it "guarda a pausa por intervenção humana" do
      patch "/automation-settings",
            params: { automationPausePeriod: "hours", automationPauseTimeTo: 2 },
            headers: auth_headers(owner),
            as: :json

      expect(response).to have_http_status(:ok)
      expect(json["automationSettings"]).to include("automationPausePeriod" => "hours", "automationPauseTimeTo" => 2)
      expect(organization.reload).to have_attributes(automation_pause_period: "hours", automation_pause_time_to: 2)
    end

    it "mescla: mandar um grupo não apaga o resto dos settings" do
      organization.update!(settings: { "chat_settings" => { "reopen_conversation_on_inbound_enabled" => true }, "automation_pause_period" => "days" })

      patch "/automation-settings", params: { automationEnabled: false }, headers: auth_headers(owner), as: :json

      expect(organization.reload.settings).to include(
        "chat_settings" => { "reopen_conversation_on_inbound_enabled" => true },
        "automation_pause_period" => "days",
        "automation_enabled" => false
      )
    end

    it "guarda e normaliza a janela de atendimento" do
      patch "/automation-settings",
            params: { businessWorkEnabled: true, businessWork: business_work },
            headers: auth_headers(owner),
            as: :json

      expect(response).to have_http_status(:ok)
      expect(organization.reload.business_work["days"]).to eq(
        [ { "day_of_week" => "1", "enabled" => "true", "windows" => [ { "start" => "09:00", "end" => "18:00" } ] } ]
      )
      expect(organization.business_work_enabled).to be(true)
      expect(json.dig("automationSettings", "businessWork", "days", 0)).to include("dayOfWeek" => "1", "enabled" => "true")
    end

    it "recusa janela ligada sem nenhum dia" do
      patch "/automation-settings", params: { businessWorkEnabled: true, businessWork: { days: [] } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("unprocessable")
      expect(organization.reload.business_work_enabled).to be(false)
    end

    it "recusa intervalo com início depois do fim" do
      invalid = { days: [ { day_of_week: "1", enabled: "true", windows: [ { start: "18:00", end: "09:00" } ] } ] }

      patch "/automation-settings", params: { businessWorkEnabled: true, businessWork: invalid }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "recusa período de pausa desconhecido" do
      patch "/automation-settings", params: { automationPausePeriod: "weeks" }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "message")).to start_with("Período de pausa")
    end

    describe "espera para a pessoa terminar de escrever" do
      it "guarda, e é o que o fluxo passa a usar" do
        patch "/automation-settings", params: { flowDebounceSeconds: 15 }, headers: auth_headers(owner), as: :json

        expect(response).to have_http_status(:ok)
        expect(json.dig("automationSettings", "flowDebounceSeconds")).to eq(15)
        expect(Flows::InboundDispatcher.debounce_seconds(organization.reload)).to eq(15)
      end

      it "zero é sem espera, e não cai no padrão" do
        patch "/automation-settings", params: { flowDebounceSeconds: 0 }, headers: auth_headers(owner), as: :json

        expect(json.dig("automationSettings", "flowDebounceSeconds")).to eq(0)
      end

      it "tem a mesma trava do disparo: de 0 a 60" do
        patch "/automation-settings", params: { flowDebounceSeconds: 600 }, headers: auth_headers(owner), as: :json
        expect(json.dig("automationSettings", "flowDebounceSeconds")).to eq(60)
        expect(organization.reload.settings["flow_debounce_seconds"]).to eq(60)

        patch "/automation-settings", params: { flowDebounceSeconds: -5 }, headers: auth_headers(owner), as: :json
        expect(json.dig("automationSettings", "flowDebounceSeconds")).to eq(0)
      end

      it "null volta ao padrão" do
        organization.update!(settings: { "flow_debounce_seconds" => 20 })

        patch "/automation-settings", params: { flowDebounceSeconds: nil }, headers: auth_headers(owner), as: :json

        expect(json.dig("automationSettings", "flowDebounceSeconds")).to eq(3)
      end

      it "o que não é número não muda nada" do
        organization.update!(settings: { "flow_debounce_seconds" => 20 })

        patch "/automation-settings", params: { flowDebounceSeconds: "logo" }, headers: auth_headers(owner), as: :json

        expect(response).to have_http_status(:ok)
        expect(json.dig("automationSettings", "flowDebounceSeconds")).to eq(20)
      end

      it "exige permissão de configuração" do
        patch "/automation-settings", params: { flowDebounceSeconds: 30 }, headers: auth_headers(member), as: :json

        expect(response).to have_http_status(:forbidden)
      end
    end

    it "não mistura organizações" do
      other = create(:organization)

      patch "/automation-settings", params: { automationEnabled: false }, headers: auth_headers(owner), as: :json

      expect(other.reload.automation_enabled?).to be(true)
      expect(organization.reload.automation_enabled?).to be(false)
    end

    it "ignora campo que não é de automação" do
      patch "/automation-settings", params: { chatSettings: { x: 1 }, companyInfo: { cnpj: "1" } }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:ok)
      expect(organization.reload.settings).not_to include("chat_settings", "company_info")
    end
  end
end
