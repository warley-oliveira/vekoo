require "rails_helper"

# Roda a semente de ponta a ponta, em cima das conversas que db/seeds/connectors.rb deixa, e abre o
# resultado pela API, como a tela vai abrir.
RSpec.describe "db/seeds/insights.rb", type: :request do
  let(:owner) { create(:account, email: "marina.duarte@exemplo.com.br", role: "owner", name: "Marina Duarte") }
  let(:organization) { owner.organization }
  let(:zone) { organization.reporting_zone }
  let(:headers) { auth_headers(owner) }

  def seed
    original = $stdout
    $stdout = StringIO.new
    load Rails.root.join("db/seeds/insights.rb")
  ensure
    $stdout = original
  end

  before do
    Rails.cache.clear
    owner
    seed
  end

  describe "números do dashboard" do
    let(:stats) { DailyChatStat.where(organization_id: organization.id) }

    it "traz 90 dias, até hoje, no fuso da organização" do
      expect(stats.count).to eq(90)
      expect(stats.pluck(:day).max).to eq(zone.today)
      expect(stats.pluck(:day).min).to eq(zone.today - 89.days)
    end

    it "traz todas as chaves que o dashboard lê" do
      expect(stats.first.metrics.keys.map(&:to_sym)).to match_array(Insights::OperationalDailyDigest::ALL_KEYS)
    end

    it "os totais batem com as partes" do
      stats.each do |stat|
        expect(stat.metrics["chats_by_channel"].values.sum).to eq(stat.metrics["chats_started"])
        expect(stat.metrics["messages_by_account"].values.sum).to eq(stat.metrics["messages_sent_by_human"])
        expect(stat.metrics["chats_handled_by_automation"] + stat.metrics["chats_with_human_touch"]).to be <= stat.metrics["chats_started"]
        expect(stat.hourly_breakdown["message_count"].values.sum).to eq(stat.metrics["messages_inbound"] + stat.metrics["messages_sent_by_automation"] + stat.metrics["messages_sent_by_human"])
      end
    end

    it "domingo é mais parado que sexta" do
      by_weekday = stats.group_by { |stat| stat.day.wday }.transform_values { |list| list.sum { |stat| stat.metrics["chats_started"] } / list.size }

      expect(by_weekday[0]).to be < by_weekday[5]
    end

    it "o ranking é de gente da organização" do
      ids = stats.flat_map { |stat| stat.metrics["messages_by_account"].keys }.uniq

      expect(organization.accounts.where(id: ids).count).to eq(ids.size)
    end

    it "o dashboard abre com dados" do
      get "/dashboard", params: { dateStart: (zone.today - 29.days).iso8601, dateEnd: zone.today.iso8601 }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json).to include("hasData" => true)
      expect(json["chatsTotal"]).to be > 300
      expect(json["messageVolume"].size).to eq(30)
      expect(json["heatMap"].size).to eq(30)
      expect(json["messagesByAccount"].first["name"]).to be_present
      expect(json["chatsByChannel"].keys).to include("whatsapp_api", "instagram")
      expect(json["firstResponseAutomationSeconds"]).to be_between(14, 38)
      expect(json["funnels"].map { |funnel| funnel["name"] }).to eq([ "Pós-venda", "Vendas da loja" ])
    end
  end

  describe "funis" do
    let(:funnel) { organization.funnels.find_by(name: "Vendas da loja") }

    it "traz os dois, com as etapas na ordem" do
      expect(organization.funnels.order(:name).map(&:name)).to eq([ "Pós-venda", "Vendas da loja" ])
      expect(funnel.stages.map(&:name)).to eq([ "Novo contato", "Em atendimento", "Proposta enviada", "Pedido fechado" ])
    end

    it "distribui as conversas, com todas as colunas preenchidas no quadro" do
      get "/funnels/#{funnel.id}/board", params: { days: 365, perColumn: 50 }, headers: headers

      expect(json["columns"].size).to eq(5)
      expect(json["columns"].map { |column| column["count"] }).to all(be_positive)
      expect(json["metrics"]["total"]).to eq(organization.chats.count)
    end

    it "as duas funcionam ao mesmo tempo na mesma conversa" do
      other = organization.funnels.find_by(name: "Pós-venda")
      chat = organization.chats.order_by(last_message_at: :desc, _id: :asc).first

      expect(chat.funnel_stage_id(funnel.id)).to be_present
      expect(chat.funnel_stage_id(other.id)).to be_present
    end
  end

  describe "dashboard personalizado" do
    let(:dashboard) { organization.custom_dashboards.where(name: "Atendimento da semana").take }

    it "todo card com fonte responde pela consulta de verdade" do
      expect(dashboard.widgets.size).to eq(8)

      dashboard.widgets.select(&:data_source).each do |widget|
        post "/custom-dashboards/query", params: widget.query, headers: headers, as: :json

        expect(response).to have_http_status(:ok), "#{widget.title}: #{response.body}"
      end
    end

    it "abre pela API, e está na lista" do
      get "/custom-dashboards", headers: headers
      expect(json["customDashboards"].map { |item| item["name"] }).to eq([ "Atendimento da semana" ])
      expect(json["customDashboards"].first).to include("widgetsCount" => 8, "createdByName" => "Marina Duarte", "isFavorite" => true)

      get "/custom-dashboards/#{dashboard.id}", headers: headers
      expect(json["customDashboard"]["widgets"].map { |widget| widget["position"] }).to eq((0..7).to_a)
    end
  end

  describe "rodar de novo" do
    it "não duplica nada" do
      expect { seed }.to not_change { DailyChatStat.where(organization_id: organization.id).count }
        .and(not_change { organization.funnels.count })
        .and(not_change { FunnelStage.count })
        .and(not_change { organization.custom_dashboards.count })
    end

    it "não desfaz o que a pessoa mudou" do
      funnel = organization.funnels.find_by(name: "Vendas da loja")
      chat = organization.chats.order_by(last_message_at: :desc, _id: :asc).first
      chat.remove_from_funnel!(funnel.id)
      funnel.update!(description: "Mudei")
      organization.custom_dashboards.first.update!(description: "Também mudei")
      stat = DailyChatStat.where(organization_id: organization.id, day: zone.today).take
      stat.update!(metrics: { "messages_inbound" => 7 })

      seed

      expect(Chat.scoped(organization.id, chat.id).funnel_stage_id(funnel.id)).to be_nil
      expect(funnel.reload.description).to eq("Mudei")
      expect(organization.custom_dashboards.first.description).to eq("Também mudei")
      expect(stat.reload.metrics).to eq("messages_inbound" => 7)
    end

    it "os números são os mesmos para o mesmo dia" do
      first = DailyChatStat.where(organization_id: organization.id).order(:day).pluck(:day, :metrics)
      DailyChatStat.where(organization_id: organization.id).delete_all

      seed

      expect(DailyChatStat.where(organization_id: organization.id).order(:day).pluck(:day, :metrics)).to eq(first)
    end
  end

  it "sem a conta de demonstração, não faz nada" do
    Account.where(email: "marina.duarte@exemplo.com.br").update_all(email: "outra@exemplo.com.br")

    expect { seed }.not_to change(Funnel, :count)
  end
end
