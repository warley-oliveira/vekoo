require "rails_helper"

RSpec.describe "Dashboard", type: :request do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:headers) { auth_headers(account) }
  let(:zone) { organization.reporting_zone }
  let(:today) { zone.today }
  let(:yesterday) { today - 1.day }

  def add_stat(day, metrics, hourly: {}, target: organization)
    DailyChatStat.create!(organization: target, day: day, metrics: metrics, hourly_breakdown: { "message_count" => hourly })
  end

  # As contas ficam sem cache entre exemplos: `memory_store` é um só no processo de teste.
  before { Rails.cache.clear }

  describe "sessão e permissão" do
    it "responde 401 sem sessão" do
      get "/dashboard"

      expect(response).to have_http_status(:unauthorized)
    end

    it "responde 403 sem a permissão dashboard" do
      get "/dashboard", headers: auth_headers(member_with(organization, chat: "all"))

      expect(response).to have_http_status(:forbidden)
      expect(json.dig("error", "code")).to eq("forbidden")
    end

    it "libera com a permissão, sem precisar ser dono" do
      get "/dashboard", headers: auth_headers(member_with(organization, dashboard: "all"))

      expect(response).to have_http_status(:ok)
    end
  end

  describe "isolamento entre organizações" do
    it "não soma o rollup de outra organização" do
      add_stat(today, { "chats_started" => 3 })
      add_stat(today, { "chats_started" => 500 }, target: create(:organization))

      get "/dashboard", headers: headers

      expect(json["chatsTotal"]).to eq(3)
    end

    it "não traz funil de outra organização" do
      create(:funnel)
      funnel = create(:funnel, organization: organization)

      get "/dashboard", headers: headers

      expect(json["funnels"].map { |item| item["id"] }).to eq([ funnel.id ])
    end
  end

  describe "período" do
    it "responde 422 com data que não é data" do
      get "/dashboard", params: { dateStart: "ontem" }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("invalidTime")
    end

    it "responde 422 com fim antes do início" do
      get "/dashboard", params: { dateStart: "2026-11-05", dateEnd: "2026-11-01" }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("invalidRange")
    end

    it "responde 422 acima de dois anos" do
      get "/dashboard", params: { dateStart: "2023-01-01", dateEnd: "2026-11-01" }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("rangeTooLong")
    end

    it "só soma os dias do período" do
      add_stat(today, { "messages_inbound" => 10 })
      add_stat(today - 10.days, { "messages_inbound" => 100 })

      get "/dashboard", params: { dateStart: (today - 2.days).iso8601, dateEnd: today.iso8601 }, headers: headers

      expect(json["messagesInbound"]).to eq(10)
      expect(json["period"]).to eq("dateStart" => (today - 2.days).iso8601, "dateEnd" => today.iso8601)
    end

    it "sem período, vale o último ano" do
      add_stat(today - 300.days, { "messages_inbound" => 7 })
      add_stat(today - 400.days, { "messages_inbound" => 100 })

      get "/dashboard", headers: headers

      expect(json["messagesInbound"]).to eq(7)
    end
  end

  describe "sem rollup" do
    it "responde o mesmo formato, zerado, e diz que não há dados" do
      get "/dashboard", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json).to include(
        "hasData" => false,
        "chatsTotal" => 0,
        "newChats" => [],
        "messageVolume" => [],
        "messagesByAccount" => [],
        "chatsByChannel" => {},
        "heatMap" => [],
        "funnels" => [],
        "firstResponseAutomationSeconds" => nil,
        "humanTouchRate" => 0.0
      )
    end
  end

  describe "agregação do rollup" do
    let(:person) { create(:account, organization: organization, name: "Camila Rocha") }
    let(:absent_id) { SecureRandom.uuid }

    before do
      add_stat(
        yesterday,
        {
          "chats_started" => 10, "active_chats" => 12, "automation_chats" => 8,
          "messages_inbound" => 100, "messages_sent_by_automation" => 80, "messages_sent_by_human" => 20, "messages_sent_by_campaign" => 5,
          "messages_by_account" => { person.id => 15, absent_id => 5 },
          "chats_by_channel" => { "whatsapp_api" => 8, "instagram" => 2 },
          "first_response_automation_seconds_sum" => 100.0, "first_response_automation_count" => 10,
          "chats_with_human_touch" => 3, "chats_handled_by_automation" => 5,
          "hours_saved" => 2.8, "messages_avoided" => 60, "out_of_hours_messages" => 4, "automation_bookings" => 2
        },
        hourly: { "14" => 30, "9" => 70 }
      )
      add_stat(
        today,
        {
          "chats_started" => 10, "active_chats" => 6, "automation_chats" => 4,
          "messages_inbound" => 50, "messages_sent_by_automation" => 40, "messages_sent_by_human" => 10,
          "messages_by_account" => { person.id => 5 },
          "chats_by_channel" => { "whatsapp_api" => 10 },
          "first_response_automation_seconds_sum" => 300.0, "first_response_automation_count" => 10,
          "chats_with_human_touch" => 1, "chats_handled_by_automation" => 3,
          "hours_saved" => 1.4, "messages_avoided" => 30, "out_of_hours_messages" => 1, "automation_bookings" => 1
        },
        hourly: { "10" => 50 }
      )

      get "/dashboard", headers: headers
    end

    it "diz que há dados" do
      expect(json["hasData"]).to be(true)
    end

    it "soma os escalares de volume ao longo do período" do
      expect(json).to include(
        "messagesInbound" => 150,
        "messagesSentByAutomation" => 120,
        "messagesSentByHuman" => 30,
        "messagesSentByCampaign" => 5,
        "chatsTotal" => 20,
        "hoursSaved" => 4.2,
        "messagesAvoided" => 90,
        "outOfHoursMessages" => 5,
        "automationBookings" => 3
      )
    end

    it "expõe a série diária de volume para o gráfico" do
      expect(json["messageVolume"]).to eq(
        [
          { "date" => yesterday.iso8601, "inbound" => 100, "automation" => 80, "campaign" => 5, "human" => 20 },
          { "date" => today.iso8601, "inbound" => 50, "automation" => 40, "campaign" => 0, "human" => 10 }
        ]
      )
    end

    it "expõe as séries de conversas" do
      expect(json["newChats"]).to eq([ { "date" => yesterday.iso8601, "count" => 10 }, { "date" => today.iso8601, "count" => 10 } ])
      expect(json["activeChats"].map { |point| point["count"] }).to eq([ 12, 6 ])
      expect(json["automationChats"].map { |point| point["count"] }).to eq([ 8, 4 ])
    end

    it "soma as chaves-hash de canais entre os dias" do
      expect(json["chatsByChannel"]).to eq("whatsapp_api" => 18, "instagram" => 2)
    end

    it "calcula o tempo de 1ª resposta como média ponderada" do
      expect(json["firstResponseAutomationSeconds"]).to eq(20.0)
      expect(json["firstResponseAutomationCount"]).to eq(20)
    end

    it "devolve nulo quando não há amostra de resposta humana" do
      expect(json["firstResponseHumanSeconds"]).to be_nil
      expect(json["firstResponseHumanCount"]).to eq(0)
    end

    it "calcula as taxas sobre o total de conversas" do
      expect(json).to include("chatsWithHumanTouch" => 4, "humanTouchRate" => 20.0, "chatsHandledByAutomation" => 8, "automationResolutionRate" => 40.0)
    end

    it "ordena o ranking por mensagens, com nome e foto, e aguenta pessoa que saiu" do
      expect(json["messagesByAccount"]).to eq(
        [
          { "id" => person.id, "name" => "Camila Rocha", "avatarUrl" => nil, "messages" => 20 },
          { "id" => absent_id, "name" => nil, "avatarUrl" => nil, "messages" => 5 }
        ]
      )
    end

    it "monta o mapa de calor, com as horas em ordem" do
      expect(json["heatMap"]).to eq(
        [
          { "date" => yesterday.iso8601, "events" => [ { "hour" => 9, "count" => 70 }, { "hour" => 14, "count" => 30 } ] },
          { "date" => today.iso8601, "events" => [ { "hour" => 10, "count" => 50 } ] }
        ]
      )
    end
  end

  it "completa com zero o dia parado, sem passar de hoje" do
    add_stat(today - 2.days, { "messages_inbound" => 1, "chats_started" => 1 })

    get "/dashboard", params: { dateStart: (today - 5.days).iso8601, dateEnd: (today + 3.days).iso8601 }, headers: headers

    expect(json["newChats"]).to eq(
      [
        { "date" => (today - 2.days).iso8601, "count" => 1 },
        { "date" => yesterday.iso8601, "count" => 0 },
        { "date" => today.iso8601, "count" => 0 }
      ]
    )
    expect(json["messageVolume"].map { |point| point["inbound"] }).to eq([ 1, 0, 0 ])
  end

  describe "funis" do
    let(:funnel) { create(:funnel, organization: organization, name: "Vendas", description: "Da loja") }

    def chat_in(stage, **attributes)
      create(:chat, organization: organization, **attributes).tap { |chat| chat.place_in_funnel!(funnel.id, stage.id) }
    end

    it "conta as conversas criadas no período" do
      chat_in(funnel.stages[0])
      chat_in(funnel.stages[1])
      chat_in(funnel.stages[1], created_at: 2.years.ago)

      get "/dashboard", params: { dateStart: (today - 7.days).iso8601 }, headers: headers

      entry = json["funnels"].first
      expect(entry).to include("id" => funnel.id, "name" => "Vendas", "description" => "Da loja", "total" => 2)
      expect(entry["stages"].first(2)).to eq(
        [
          { "id" => funnel.stages[0].id, "name" => "Novo", "count" => 1, "reached" => 2, "conversionRate" => 100.0, "stepRate" => 100.0, "dropOff" => 0 },
          { "id" => funnel.stages[1].id, "name" => "Atendimento", "count" => 1, "reached" => 1, "conversionRate" => 50.0, "stepRate" => 50.0, "dropOff" => 1 }
        ]
      )
      expect(entry["tags"]).to eq([])
    end

    it "traz funil sem conversas, zerado: a tela decide o que mostrar" do
      funnel

      get "/dashboard", headers: headers

      expect(json["funnels"].first["total"]).to eq(0)
    end

    it "conta só o que a pessoa pode ver, inclusive com o cache de outra pessoa" do
      person = member_with(organization, dashboard: "all", chat_list_to: "assigned")
      chat_in(funnel.stages[0], assigned_account_id: person.id)
      chat_in(funnel.stages[0], assigned_account_id: account.id)

      get "/dashboard", headers: headers
      expect(json["funnels"].first["total"]).to eq(2)

      get "/dashboard", headers: auth_headers(person)
      expect(json["funnels"].first["total"]).to eq(1)
    end
  end

  describe "cache" do
    it "guarda o relatório por 10 minutos" do
      add_stat(today, { "messages_inbound" => 1 })
      get "/dashboard", headers: headers
      expect(json["messagesInbound"]).to eq(1)

      DailyChatStat.where(organization_id: organization.id).update_all(metrics: { "messages_inbound" => 2 })
      get "/dashboard", headers: headers
      expect(json["messagesInbound"]).to eq(1)

      travel_to(11.minutes.from_now) do
        get "/dashboard", headers: auth_headers(account)
        expect(json["messagesInbound"]).to eq(2)
      end
    end

    it "período diferente não usa o mesmo cache" do
      add_stat(today, { "messages_inbound" => 1 })
      get "/dashboard", headers: headers

      get "/dashboard", params: { dateStart: (today - 20.days).iso8601, dateEnd: (today - 10.days).iso8601 }, headers: headers

      expect(json["messagesInbound"]).to eq(0)
    end
  end
end
