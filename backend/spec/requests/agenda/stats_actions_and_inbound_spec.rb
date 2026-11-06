require "rails_helper"

RSpec.describe "Agenda: painel, ações agendadas e aviso do Google", type: :request do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization, timezone: "America/Sao_Paulo") }
  let(:account) { create(:account, organization: organization) }
  let(:headers) { auth_headers(account) }
  let(:calendar) { create(:agenda_calendar, organization: organization, time_zone: "America/Sao_Paulo") }

  describe "GET /dashboard/calendar-stats" do
    let(:zone) { calendar.zone }
    let(:ana) { create(:agenda_professional, calendar: calendar, name: "Ana", color: "#111111") }
    let(:bia) { create(:agenda_professional, calendar: calendar, name: "Bia") }

    before { travel_to(zone.local(2030, 1, 20, 12, 0)) }
    after { travel_back }

    def booking(at, **attributes)
      create(:agenda_booking, { calendar: calendar, start: at, end: at + 1.hour, skip_professional_notifications: true }.merge(attributes))
    end

    def stats(**params)
      get "/dashboard/calendar-stats", params: { dateStart: "2030-01-01", dateEnd: "2030-01-31" }.merge(params), headers: headers
      json
    end

    it "exige sessão" do
      get "/dashboard/calendar-stats", as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it "exige o recurso dashboard ou calendar" do
      role = create(:access_role, organization: organization, permissions: AccessRole::BLANK_PERMISSIONS)
      member = create(:account, organization: organization, role: "member", access_role: role)

      get "/dashboard/calendar-stats", headers: auth_headers(member), as: :json
      expect(response).to have_http_status(:forbidden)

      role.update!(permissions: AccessRole::BLANK_PERMISSIONS.merge("dashboard" => "all"))
      get "/dashboard/calendar-stats", headers: auth_headers(member), as: :json
      expect(response).to have_http_status(:ok)
    end

    it "soma os totais e as taxas" do
      booking(zone.local(2030, 1, 14, 10, 0), attendance_status: "show")
      booking(zone.local(2030, 1, 14, 11, 0), attendance_status: "show")
      booking(zone.local(2030, 1, 15, 10, 0), attendance_status: "no_show")
      booking(zone.local(2030, 1, 16, 10, 0), status: "canceled")
      booking(zone.local(2030, 1, 17, 10, 0), status: "archived")

      expect(stats).to include("total" => 4, "show" => 2, "noShow" => 1, "pending" => 1, "canceled" => 1, "active" => 3, "attendanceRate" => 66.7, "cancellationRate" => 25.0)
    end

    it "sem nada no período, as taxas são nulas" do
      expect(stats).to include("total" => 0, "attendanceRate" => nil, "cancellationRate" => nil, "daily" => [], "byProfessional" => [], "avgPerDay" => 0.0)
    end

    it "não conta de outra organização" do
      create(:agenda_booking, start: zone.local(2030, 1, 14, 10, 0), end: zone.local(2030, 1, 14, 11, 0), skip_professional_notifications: true)

      expect(stats["total"]).to eq(0)
    end

    it "agrupa por dia, dia da semana e hora no fuso da organização, e não em UTC" do
      # 22:30 de segunda em São Paulo é 01:30 de terça em UTC.
      booking(zone.local(2030, 1, 14, 22, 30), attendance_status: "show")

      result = stats

      expect(result["daily"]).to eq([ { "date" => "2030-01-14", "show" => 1, "noShow" => 0 } ])
      expect(result["byDayOfWeek"]).to eq([ 0, 1, 0, 0, 0, 0, 0 ])
      expect(result["byHour"][22]).to eq(1)
      expect(result["byHour"].sum).to eq(1)
    end

    it "o período vale inteiro no fuso da organização" do
      booking(zone.local(2030, 1, 31, 23, 30))
      booking(zone.local(2030, 2, 1, 0, 30))

      expect(stats["total"]).to eq(1)
    end

    it "traz os próximos 5 dos próximos 7 dias, dos ativos" do
      soon = Array.new(6) { |index| booking(zone.local(2030, 1, 21, 8 + index, 0), title: "Próximo #{index}") }
      booking(zone.local(2030, 2, 10, 10, 0))
      booking(zone.local(2030, 1, 21, 20, 0), status: "canceled")

      upcoming = stats["upcoming"]

      expect(upcoming.map { |item| item["id"] }).to eq(soon.first(5).map { |record| record.id.to_s })
      expect(upcoming.first).to include("title" => "Próximo 0", "status" => "active", "attendanceStatus" => nil)
    end

    it "soma por profissional, de quem atendeu mais para menos" do
      booking(zone.local(2030, 1, 14, 10, 0), professional: bia, attendance_status: "no_show")
      booking(zone.local(2030, 1, 15, 10, 0), professional: ana, attendance_status: "show")
      booking(zone.local(2030, 1, 16, 10, 0), professional: ana)

      expect(stats["byProfessional"]).to eq([
        { "id" => ana.id.to_s, "name" => "Ana", "color" => "#111111", "show" => 1, "noShow" => 0, "total" => 2 },
        { "id" => bia.id.to_s, "name" => "Bia", "color" => bia.color, "show" => 0, "noShow" => 1, "total" => 1 }
      ])
    end

    it "média por dia do período" do
      booking(zone.local(2030, 1, 14, 10, 0))

      expect(stats(dateStart: "2030-01-14", dateEnd: "2030-01-15")["avgPerDay"]).to eq(0.5)
    end

    it "data ilegível é 422" do
      stats(dateStart: "ontem")

      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  describe "ações agendadas da conversa" do
    let(:chat) { create(:chat, organization_id: organization.id) }
    let(:base) { "/chats/#{chat.id}/scheduled-actions" }

    describe "sessão e permissão" do
      it "exige sessão" do
        get base, as: :json

        expect(response).to have_http_status(:unauthorized)
      end

      it "exige o recurso chat" do
        role = create(:access_role, organization: organization, permissions: AccessRole::BLANK_PERMISSIONS)
        member = create(:account, organization: organization, role: "member", access_role: role)

        get base, headers: auth_headers(member), as: :json
        expect(response).to have_http_status(:forbidden)

        delete "#{base}/qualquer", headers: auth_headers(member), as: :json
        expect(response).to have_http_status(:forbidden)
      end
    end

    describe "GET" do
      it "traz o que falta sair e o estado da automação" do
        action = create(:scheduled_action, chat: chat, booking_id: "b1", metadata: { "booking_title" => "Consulta", "config_index" => 0 })
        create(:scheduled_action, chat: chat, status: :canceled)

        get base, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(json["actions"].sole).to include(
          "id" => action.id.to_s, "chatId" => chat.id.to_s, "kind" => "booking_reminder", "status" => "pending", "bookingId" => "b1",
          "metadata" => { "bookingTitle" => "Consulta", "configIndex" => 0 }
        )
        expect(json["actions"].sole["scheduledAt"]).to be_a(Integer)
        expect(json["actions"].sole).not_to have_key("token")
        expect(json["automation"]).to eq("enabled" => true, "reactivatesAt" => nil)
      end

      it "conversa de outra organização é 404" do
        get "/chats/#{create(:chat, organization_id: create(:organization).id).id}/scheduled-actions", headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
      end
    end

    describe "DELETE :id" do
      it "cancela: fica registrado quem foi, e o job vai chegar e não fazer nada" do
        action = create(:scheduled_action, chat: chat)

        expect {
          delete "#{base}/#{action.id}", headers: headers, as: :json
        }.to have_broadcasted_to(ChatMessage::Base.stream_for(chat)).with(hash_including(event: "scheduled_actions_changed"))

        expect(response).to have_http_status(:no_content)
        expect(action.reload).to be_canceled
        expect(action).to have_attributes(canceled_by_account_id: account.id, canceled_at: be_present)
      end

      it "o que já saiu não se cancela" do
        action = create(:scheduled_action, chat: chat, status: :executed)

        delete "#{base}/#{action.id}", headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
      end

      it "de outra conversa é 404" do
        action = create(:scheduled_action, chat: create(:chat, organization_id: organization.id))

        delete "#{base}/#{action.id}", headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
        expect(action.reload).to be_pending
      end
    end
  end

  describe "POST /inbound/google-calendar/:id" do
    let(:connector) { create(:connector_google_calendar, organization: organization) }
    let(:google_headers) { { "X-Goog-Channel-Token" => "token-do-canal", "X-Goog-Resource-State" => "exists" } }

    def ping(id = connector.id, with: google_headers)
      post "/inbound/google-calendar/#{id}", headers: with
    end

    it "responde 200 e deixa o trabalho para o job" do
      expect { ping }.to have_enqueued_job(Agenda::GoogleCalendarSyncJob).with(connector.id.to_s, organization.id.to_s)

      expect(response).to have_http_status(:ok)
    end

    it "não precisa de sessão" do
      ping

      expect(response).not_to have_http_status(:unauthorized)
    end

    it "sem o token que combinamos é 403, e nada acontece" do
      expect { ping(with: { "X-Goog-Channel-Token" => "chute" }) }.not_to have_enqueued_job

      expect(response).to have_http_status(:forbidden)
    end

    it "conector desligado responde 200, e não sincroniza" do
      connector.update!(status: :closed)

      expect { ping }.not_to have_enqueued_job

      expect(response).to have_http_status(:ok)
    end

    it "conector que não existe responde 200, sem revelar nada" do
      expect { ping("6aee0814109ff006f85e9aec") }.not_to have_enqueued_job

      expect(response).to have_http_status(:ok)
    end

    it "o aviso de que o canal abriu não dispara sincronização" do
      expect { ping(with: google_headers.merge("X-Goog-Resource-State" => "sync")) }.not_to have_enqueued_job

      expect(response).to have_http_status(:ok)
    end
  end
end
