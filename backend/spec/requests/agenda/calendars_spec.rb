require "rails_helper"

RSpec.describe "Agenda: calendários", type: :request do
  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:headers) { auth_headers(account) }
  let(:calendar) { create(:agenda_calendar, organization: organization) }
  let(:foreign) { create(:agenda_calendar) }

  describe "sessão e permissão" do
    [
      [ :get, "/calendars" ],
      [ :post, "/calendars" ],
      [ :get, "/calendars/qualquer" ],
      [ :patch, "/calendars/qualquer" ],
      [ :post, "/calendars/qualquer/google-calendar/connect" ],
      [ :post, "/calendars/qualquer/google-calendar/callback" ],
      [ :delete, "/calendars/qualquer/google-calendar" ],
      [ :get, "/calendars/qualquer/attendance-sequences" ],
      [ :put, "/calendars/qualquer/attendance-sequences" ],
      [ :get, "/calendars/qualquer/attendance-sequences/bookings" ],
      [ :post, "/calendars/qualquer/attendance-sequences/preview" ],
      [ :get, "/calendars/qualquer/contact-notification-preview/bookings" ],
      [ :post, "/calendars/qualquer/contact-notification-preview" ],
      [ :get, "/calendars/qualquer/availability" ]
    ].each do |verb, path|
      it "#{verb.upcase} #{path} exige sessão" do
        public_send(verb, path, as: :json)

        expect(response).to have_http_status(:unauthorized)
      end

      it "#{verb.upcase} #{path} exige o recurso calendar" do
        role = create(:access_role, organization: organization, permissions: AccessRole::BLANK_PERMISSIONS)
        member = create(:account, organization: organization, role: "member", access_role: role)

        public_send(verb, path, headers: auth_headers(member), as: :json)

        expect(response).to have_http_status(:forbidden)
      end
    end
  end

  describe "GET /calendars" do
    it "lista os da organização, sem os de outra" do
      calendar
      foreign

      get "/calendars", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["calendars"].map { |item| item["id"] }).to eq([ calendar.id.to_s ])
      expect(json["meta"]).to include("total" => 1)
    end

    it "sai em camelCase, com as regras já resolvidas e sem deixar o Google de fora" do
      calendar

      get "/calendars", headers: headers, as: :json

      item = json["calendars"].first
      expect(item).to include("timeZone" => "America/Sao_Paulo", "calendarType" => "professional", "googleCalendarConnected" => false, "googleCalendarAvailable" => false, "googleCalendarConnector" => nil)
      expect(item["professionalEventRules"].map { |rule| rule["event"] }).to eq(%w[created canceled rescheduled])
      expect(item["createdAt"]).to be_a(Integer)
    end
  end

  describe "GET /calendars/:id" do
    it "mostra" do
      get "/calendars/#{calendar.id}", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["id"]).to eq(calendar.id.to_s)
    end

    it "de outra organização é 404" do
      get "/calendars/#{foreign.id}", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /calendars" do
    it "cria na organização da sessão, ignorando a que vier no corpo" do
      post "/calendars", params: { calendar: { name: "Estúdio", timeZone: "America/Manaus", calendarType: "class_group", organizationId: create(:organization).id } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      created = Agenda::Calendar.find(json["id"])
      expect(created).to have_attributes(name: "Estúdio", time_zone: "America/Manaus", calendar_type: "class_group", organization_id: organization.id.to_s)
    end

    it "sem fuso, usa o da organização" do
      organization.update!(timezone: "America/Recife")

      post "/calendars", params: { calendar: { name: "Estúdio" } }, headers: headers, as: :json

      expect(json["timeZone"]).to eq("America/Recife")
    end

    it "sem envelope é 400" do
      post "/calendars", params: { name: "Estúdio" }, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "code")).to eq("parameterMissing")
    end

    it "sem nome é 422, com o campo" do
      post "/calendars", params: { calendar: { name: "" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json["error"]).to include("code" => "unprocessable", "field" => "name")
    end

    it "fuso inválido é 422, com a mensagem em português" do
      post "/calendars", params: { calendar: { name: "A", timeZone: "-3" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json["error"]["field"]).to eq("timeZone")
      expect(json["error"]["message"]).to include("fuso horário")
    end

    it "responde no idioma pedido" do
      post "/calendars?locale=en", params: { calendar: { name: "A", timeZone: "-3" } }, headers: headers, as: :json

      expect(json["error"]["message"]).to include("time zone")
    end
  end

  describe "PATCH /calendars/:id" do
    it "grava as regras de lembrete, em camelCase na entrada e na saída" do
      patch "/calendars/#{calendar.id}", params: { calendar: {
        schedulingNotificationEnabled: true,
        schedulingNotificationReactivateAutomation: true,
        schedulingNotificationIgnoreAutomationPaused: true,
        schedulingNotificationConfig: [ { interval: 1, period: "days", message: "Oi {{nome}}", aiPrompt: "Lembre" } ],
        professionalNotificationsSettings: [ { timeBefore: 2, period: "hours", message: "Em breve", push: true, whatsapp: false } ],
        professionalEventNotifications: [ { event: "created", push: false, whatsapp: true, message: "Novo" } ]
      } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["schedulingNotificationConfig"]).to eq([ { "interval" => 1, "period" => "days", "message" => "Oi {{nome}}", "aiPrompt" => "Lembre" } ])
      expect(json["professionalNotificationsSettings"]).to eq([ { "timeBefore" => 2, "period" => "hours", "message" => "Em breve", "push" => true, "whatsapp" => false } ])
      expect(json["professionalEventRules"].first).to include("event" => "created", "push" => false, "message" => "Novo")
      expect(calendar.reload.scheduling_notification_reactivate_automation).to be(true)
      expect(calendar.scheduling_notification_ignore_automation_paused).to be(true)
    end

    it "lista vazia apaga a última regra, e nula também" do
      calendar.update!(scheduling_notification_config: [ { "interval" => 1, "period" => "hours", "message" => "Oi" } ])

      patch "/calendars/#{calendar.id}", params: { calendar: { schedulingNotificationConfig: [] } }, headers: headers, as: :json
      expect(calendar.reload.scheduling_notification_config).to eq([])

      calendar.update!(scheduling_notification_config: [ { "interval" => 1, "period" => "hours", "message" => "Oi" } ])

      patch "/calendars/#{calendar.id}", params: { calendar: { schedulingNotificationConfig: nil } }, headers: headers, as: :json
      expect(calendar.reload.scheduling_notification_config).to eq([])
    end

    it "regra incompleta é 422" do
      patch "/calendars/#{calendar.id}", params: { calendar: { schedulingNotificationConfig: [ { interval: 0, period: "days", message: "x" } ] } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json["error"]["field"]).to eq("schedulingNotificationConfig")
    end

    it "canal de outra organização não fica gravado" do
      patch "/calendars/#{calendar.id}", params: { calendar: { professionalWhatsappConnectorId: create(:connector_whatsapp_web).id.to_s } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(calendar.reload.professional_whatsapp_connector_id).to be_nil
    end

    it "não muda a organização pelo corpo, nem alcança outra" do
      patch "/calendars/#{calendar.id}", params: { calendar: { name: "Novo", organizationId: "outra" } }, headers: headers, as: :json
      expect(calendar.reload).to have_attributes(name: "Novo", organization_id: organization.id.to_s)

      patch "/calendars/#{foreign.id}", params: { calendar: { name: "Invadido" } }, headers: headers, as: :json
      expect(response).to have_http_status(:not_found)
      expect(foreign.reload.name).not_to eq("Invadido")
    end
  end

  describe "sem exclusão" do
    it "DELETE /calendars/:id não existe: apagar calendário precisa de decisão de produto" do
      delete "/calendars/#{calendar.id}", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(Agenda::Calendar.where(id: calendar.id)).to exist
    end
  end

  describe "Google Agenda" do
    let(:google_env) do
      { "GOOGLE_CALENDAR_CLIENT_ID" => "client-id", "GOOGLE_CALENDAR_CLIENT_SECRET" => "client-secret", "GOOGLE_CALENDAR_REDIRECT_URI" => "https://app.exemplo.com/google/callback" }
    end

    describe "sem credencial" do
      it "conectar é 422 com código próprio, e o resto do calendário segue" do
        post "/calendars/#{calendar.id}/google-calendar/connect", headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json.dig("error", "code")).to eq("googleNotConfigured")

        get "/calendars/#{calendar.id}", headers: headers, as: :json
        expect(json).to include("googleCalendarAvailable" => false, "googleCalendarConnected" => false)
      end
    end

    context "com credencial" do
      around { |example| with_env(google_env) { example.run } }

      describe "POST connect" do
        it "cria o conector pendente, liga ao calendário e devolve o endereço de autorização" do
          post "/calendars/#{calendar.id}/google-calendar/connect", headers: headers, as: :json

          expect(response).to have_http_status(:ok)
          connector = Connector::GoogleCalendar.find(json["connectorId"])
          expect(connector).to have_attributes(status: :pending, organization_id: organization.id.to_s)
          expect(calendar.reload.google_calendar_connector_id).to eq(connector.id.to_s)

          state = Rack::Utils.parse_query(URI.parse(json["authorizationUrl"]).query)["state"]
          expect(state).to start_with("#{calendar.id}.")
        end

        it "reconectar reaproveita o conector" do
          connector = create(:connector_google_calendar, organization: organization, status: :failed)
          calendar.update!(google_calendar_connector_id: connector.id.to_s)

          expect {
            post "/calendars/#{calendar.id}/google-calendar/connect", headers: headers, as: :json
          }.not_to(change { Connector::GoogleCalendar.count })

          expect(json["connectorId"]).to eq(connector.id.to_s)
        end

        it "calendário de outra organização é 404" do
          post "/calendars/#{foreign.id}/google-calendar/connect", headers: headers, as: :json

          expect(response).to have_http_status(:not_found)
        end
      end

      describe "POST callback" do
        let(:connector) { create(:connector_google_calendar, organization: organization, status: :pending, google_calendar_id: nil, refresh_token: nil, access_token: nil, token_expires_at: nil) }
        let(:state) { Agenda::GoogleOauthState.generate(calendar, account) }
        let(:id_token) { "h.#{Base64.urlsafe_encode64({ email: 'clinica@gmail.com' }.to_json, padding: false)}.s" }

        before { calendar.update!(google_calendar_connector_id: connector.id.to_s) }

        def stub_google(watch_status: 200)
          stub_request(:post, "https://oauth2.googleapis.com/token").to_return(json_reply({ access_token: "acesso", refresh_token: "renovar", expires_in: 3600, id_token: id_token }))
          stub_request(:post, "https://www.googleapis.com/calendar/v3/calendars").to_return(json_reply({ id: "app@group.calendar.google.com" }))
          stub_request(:post, %r{calendars/app@group\.calendar\.google\.com/events/watch})
            .to_return(json_reply({ id: "canal", resourceId: "recurso", expiration: "1893456000000" }, status: watch_status))
        end

        it "troca o código, cria o calendário do app, abre o canal e mostra a conta" do
          stub_google

          expect {
            post "/calendars/#{calendar.id}/google-calendar/callback", params: { code: "abc", state: state }, headers: headers, as: :json
          }.to have_enqueued_job(Agenda::GoogleCalendarSyncJob)

          expect(response).to have_http_status(:ok)
          expect(connector.reload).to have_attributes(status: :active, refresh_token: "renovar", access_token: "acesso", google_email: "clinica@gmail.com", google_calendar_id: "app@group.calendar.google.com", google_channel_id: "canal")
          expect(json["calendar"]).to include("googleCalendarConnected" => true)
          expect(json.dig("calendar", "googleCalendarConnector")).to include("googleEmail" => "clinica@gmail.com", "status" => "active")
        end

        it "o Google recusar abrir o canal não desfaz a conexão: a renovação diária tenta de novo" do
          stub_google(watch_status: 400)

          post "/calendars/#{calendar.id}/google-calendar/callback", params: { code: "abc", state: state }, headers: headers, as: :json

          expect(response).to have_http_status(:ok)
          expect(connector.reload).to have_attributes(status: :active, watch_expires_at: nil)
        end

        it "state de outra pessoa é recusado, sem chamar o Google" do
          other_state = Agenda::GoogleOauthState.generate(calendar, create(:account, organization: organization))

          post "/calendars/#{calendar.id}/google-calendar/callback", params: { code: "abc", state: other_state }, headers: headers, as: :json

          expect(response).to have_http_status(:unprocessable_entity)
          expect(json.dig("error", "code")).to eq("invalidState")
          expect(a_request(:post, /oauth2\.googleapis/)).not_to have_been_made
        end

        it "sem código é 400" do
          post "/calendars/#{calendar.id}/google-calendar/callback", params: { state: state }, headers: headers, as: :json

          expect(response).to have_http_status(:bad_request)
        end

        it "código recusado pelo Google é 422" do
          stub_request(:post, "https://oauth2.googleapis.com/token").to_return(json_reply({ error: "invalid_grant" }, status: 400))

          post "/calendars/#{calendar.id}/google-calendar/callback", params: { code: "ruim", state: state }, headers: headers, as: :json

          expect(response).to have_http_status(:unprocessable_entity)
          expect(json.dig("error", "code")).to eq("googleAuthorizationFailed")
        end

        it "sem conexão começada é 422" do
          calendar.update!(google_calendar_connector_id: nil)

          post "/calendars/#{calendar.id}/google-calendar/callback", params: { code: "abc", state: state }, headers: headers, as: :json

          expect(json.dig("error", "code")).to eq("googleNotStarted")
        end

        it "Google fora do ar ao criar o calendário é 422, com a conta já autorizada" do
          stub_request(:post, "https://oauth2.googleapis.com/token").to_return(json_reply({ access_token: "acesso", refresh_token: "renovar", expires_in: 3600 }))
          stub_request(:post, "https://www.googleapis.com/calendar/v3/calendars").to_return(status: 400, body: { error: { message: "nope" } }.to_json, headers: { "Content-Type" => "application/json" })

          post "/calendars/#{calendar.id}/google-calendar/callback", params: { code: "abc", state: state }, headers: headers, as: :json

          expect(json.dig("error", "code")).to eq("googleConnectionFailed")
        end
      end

      describe "DELETE" do
        it "desliga, apaga os tokens e solta o calendário" do
          connector = create(:connector_google_calendar, organization: organization)
          calendar.update!(google_calendar_connector_id: connector.id.to_s)

          delete "/calendars/#{calendar.id}/google-calendar", headers: headers, as: :json

          expect(response).to have_http_status(:ok)
          expect(json["calendar"]).to include("googleCalendarConnected" => false, "googleCalendarConnector" => nil)
          expect(connector.reload).to have_attributes(status: :closed, refresh_token: nil)
          expect(calendar.reload.google_calendar_connector_id).to be_nil
        end

        it "sem conexão é 404" do
          delete "/calendars/#{calendar.id}/google-calendar", headers: headers, as: :json

          expect(response).to have_http_status(:not_found)
        end
      end
    end

    it "fica fora de /connectors" do
      connector = create(:connector_google_calendar, organization: organization)

      get "/connectors", headers: headers, as: :json
      expect(json["connectors"].map { |item| item["id"] }).not_to include(connector.id.to_s)

      get "/connectors/#{connector.id}", headers: headers, as: :json
      expect(response).to have_http_status(:not_found)
    end
  end

  describe "sequências" do
    let(:sequence) do
      {
        name: "Recuperar", trigger: "no_show", enabled: true, autoEnroll: true, stopOnReply: true,
        ignoreAutomationPaused: false, reactivateAutomation: true, autoEnrollAnchors: %w[attendance_mark after_event_end],
        autoEnrollMinutesAfterEnd: 120,
        steps: [ { name: "Oi", message: "Sentimos sua falta", aiPrompt: "Convide para remarcar", runAfter: 1, runAfterUnit: "days", timeFrom: 9, timeAt: 18, allDay: false } ]
      }
    end

    describe "GET" do
      it "devolve a lista, em camelCase" do
        calendar.update!(attendance_sequences: [ { "id" => "a", "name" => "X", "trigger" => "show", "auto_enroll" => true, "steps" => [] } ])

        get "/calendars/#{calendar.id}/attendance-sequences", headers: headers, as: :json

        expect(json["attendanceSequences"]).to eq([ { "id" => "a", "name" => "X", "trigger" => "show", "autoEnroll" => true, "steps" => [] } ])
      end

      it "de outra organização é 404" do
        get "/calendars/#{foreign.id}/attendance-sequences", headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
      end
    end

    describe "PUT" do
      it "substitui a lista inteira, dando id a quem não tem" do
        calendar.update!(attendance_sequences: [ { "id" => "velha", "name" => "Velha", "trigger" => "show" } ])

        put "/calendars/#{calendar.id}/attendance-sequences", params: { attendanceSequences: [ sequence ] }, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        saved = json["attendanceSequences"].sole
        expect(saved).to include("name" => "Recuperar", "autoEnroll" => true, "reactivateAutomation" => true, "autoEnrollMinutesAfterEnd" => 120, "autoEnrollAnchors" => %w[attendance_mark after_event_end])
        expect(saved["id"]).to be_present
        expect(saved["steps"].first).to include("aiPrompt" => "Convide para remarcar", "runAfterUnit" => "days", "timeFrom" => 9)
        expect(saved["steps"].first["id"]).to be_present
      end

      it "mantém o id que veio" do
        put "/calendars/#{calendar.id}/attendance-sequences", params: { attendanceSequences: [ sequence.merge(id: "minha") ] }, headers: headers, as: :json

        expect(json["attendanceSequences"].first["id"]).to eq("minha")
      end

      it "lista vazia apaga todas" do
        calendar.update!(attendance_sequences: [ { "id" => "velha", "name" => "Velha", "trigger" => "show" } ])

        put "/calendars/#{calendar.id}/attendance-sequences", params: { attendanceSequences: [] }, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(calendar.reload.attendance_sequences).to eq([])
      end

      it "sem o campo é 400, e não apaga nada" do
        calendar.update!(attendance_sequences: [ { "id" => "velha", "name" => "Velha", "trigger" => "show" } ])

        put "/calendars/#{calendar.id}/attendance-sequences", params: {}, headers: headers, as: :json

        expect(response).to have_http_status(:bad_request)
        expect(calendar.reload.attendance_sequences.map { |item| item["id"] }).to eq([ "velha" ])
      end

      it "sequência inválida é 422" do
        put "/calendars/#{calendar.id}/attendance-sequences", params: { attendanceSequences: [ sequence.merge(trigger: "talvez") ] }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json["error"]["field"]).to eq("attendanceSequences")
      end
    end

    describe "simulação" do
      let(:chat) { create(:chat, organization_id: organization.id, user_name: "Maria") }
      let(:booking) { create(:agenda_booking, calendar: calendar, chat: chat, skip_professional_notifications: true, start: calendar.zone.local(2030, 1, 14, 15, 0), end: calendar.zone.local(2030, 1, 14, 16, 0)) }
      let(:ai) { instance_double(Ai::Chat) }

      before { allow(Ai::Chat).to receive(:new).and_return(ai) }

      describe "GET bookings" do
        it "lista os candidatos, só os que têm conversa, e só do calendário" do
          booking
          create(:agenda_booking, calendar: calendar, skip_professional_notifications: true)
          create(:agenda_booking, calendar: create(:agenda_calendar, organization: organization), chat: chat, skip_professional_notifications: true)

          get "/calendars/#{calendar.id}/attendance-sequences/bookings", headers: headers, as: :json

          expect(json["bookings"].map { |item| item["id"] }).to eq([ booking.id.to_s ])
          expect(json["bookings"].first).to include("userName" => "Maria", "chatId" => chat.id.to_s, "title" => "Consulta")
        end
      end

      describe "POST preview" do
        it "sem instrução, devolve o texto preenchido, de graça" do
          post "/calendars/#{calendar.id}/attendance-sequences/preview", params: { bookingId: booking.id.to_s, message: "Oi {{nome}}, às {{hora}}" }, headers: headers, as: :json

          expect(response).to have_http_status(:ok)
          expect(json["message"]).to eq("Oi Maria, às 15:00")
          expect(organization.reload.credits_used).to eq(0)
        end

        it "com instrução, gera, cobra, e as ferramentas não gravam" do
          allow(ai).to receive(:complete_with_tools) do |**, &block|
            block.call("add_tag", { "name" => "quente" })
            "Vamos remarcar, Maria?"
          end

          expect {
            post "/calendars/#{calendar.id}/attendance-sequences/preview", params: { bookingId: booking.id.to_s, aiPrompt: "Convide" }, headers: headers, as: :json
          }.to change { organization.reload.credits_used }.by(1)

          expect(json["message"]).to eq("Vamos remarcar, Maria?")
          expect(chat.reload.chat_tag_ids).to be_empty
          expect(ChatMessage::Base.unscoped.where(chat_id: chat.id)).not_to exist
        end

        it "sem créditos é 422 com o código que a tela conhece" do
          organization.update!(credits_used: organization.credits_total)

          post "/calendars/#{calendar.id}/attendance-sequences/preview", params: { bookingId: booking.id.to_s, aiPrompt: "Convide" }, headers: headers, as: :json

          expect(response).to have_http_status(:unprocessable_entity)
          expect(json.dig("error", "code")).to eq("noCredits")
        end

        it "IA fora do ar é 503, e o crédito volta" do
          allow(ai).to receive(:complete_with_tools).and_raise(Ai::Chat::Failed, "fora do ar")

          expect {
            post "/calendars/#{calendar.id}/attendance-sequences/preview", params: { bookingId: booking.id.to_s, aiPrompt: "Convide" }, headers: headers, as: :json
          }.not_to(change { organization.reload.credits_used })

          expect(response).to have_http_status(:service_unavailable)
          expect(json.dig("error", "code")).to eq("failed")
        end

        it "agendamento sem conversa é 422" do
          without_chat = create(:agenda_booking, calendar: calendar, skip_professional_notifications: true)

          post "/calendars/#{calendar.id}/attendance-sequences/preview", params: { bookingId: without_chat.id.to_s, message: "Oi" }, headers: headers, as: :json

          expect(response).to have_http_status(:unprocessable_entity)
          expect(json.dig("error", "code")).to eq("bookingWithoutChat")
        end

        it "agendamento de outro calendário é 404" do
          other = create(:agenda_booking, chat: chat, calendar: create(:agenda_calendar, organization: organization), skip_professional_notifications: true)

          post "/calendars/#{calendar.id}/attendance-sequences/preview", params: { bookingId: other.id.to_s, message: "Oi" }, headers: headers, as: :json

          expect(response).to have_http_status(:not_found)
        end

        it "sem agendamento é 400" do
          post "/calendars/#{calendar.id}/attendance-sequences/preview", params: { message: "Oi" }, headers: headers, as: :json

          expect(response).to have_http_status(:bad_request)
        end
      end

      describe "lembrete: POST contact-notification-preview" do
        let!(:first_message) { create(:chat_text_message, chat: chat, content: "Primeira", created_at: 2.minutes.ago) }
        let!(:second_message) { create(:chat_text_message, chat: chat, content: "Segunda", created_at: 1.minute.ago) }

        def prompt_sent
          captured = nil
          allow(ai).to receive(:complete) do |prompt:, **|
            captured = prompt
            "Lembrete pronto"
          end
          yield
          captured
        end

        it "sem messageIds, usa o histórico normal, sem ferramentas e sem enviar" do
          prompt = prompt_sent do
            post "/calendars/#{calendar.id}/contact-notification-preview", params: { bookingId: booking.id.to_s, aiPrompt: "Lembre" }, headers: headers, as: :json
          end

          expect(json["message"]).to eq("Lembrete pronto")
          expect(prompt).to include("Cliente: Primeira", "Cliente: Segunda")
          expect(ChatMessage::Base.unscoped.where(chat_id: chat.id, role: "assistant")).not_to exist
        end

        it "com messageIds, só as escolhidas" do
          prompt = prompt_sent do
            post "/calendars/#{calendar.id}/contact-notification-preview", params: { bookingId: booking.id.to_s, aiPrompt: "Lembre", messageIds: [ second_message.id.to_s ] }, headers: headers, as: :json
          end

          expect(prompt).to include("Cliente: Segunda")
          expect(prompt).not_to include("Cliente: Primeira")
        end

        it "com lista vazia, nenhuma" do
          prompt = prompt_sent do
            post "/calendars/#{calendar.id}/contact-notification-preview", params: { bookingId: booking.id.to_s, aiPrompt: "Lembre", messageIds: [] }, headers: headers, as: :json
          end

          expect(prompt).not_to include("Cliente:")
        end

        it "lista candidatos" do
          get "/calendars/#{calendar.id}/contact-notification-preview/bookings", headers: headers, as: :json

          expect(json["bookings"]).to eq([])
        end
      end
    end
  end

  describe "GET /calendars/:id/availability" do
    let(:professional) { create(:agenda_professional, :with_rule, calendar: calendar, name: "Ana") }
    let(:service) { create(:agenda_offering, calendar: calendar, name: "Limpeza", time_increment_interval: 60, professionals: [ professional ]) }

    it "devolve os horários por dia" do
      get "/calendars/#{calendar.id}/availability", params: { serviceId: service.id.to_s, start: 1.day.from_now.to_date.to_s, end: 8.days.from_now.to_date.to_s }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json).to include("professionalName" => "Ana", "serviceName" => "Limpeza", "fallback" => false)
      expect(json["slots"]).to be_a(Hash)
    end

    it "serviço de outro calendário é 404" do
      other = create(:agenda_offering, calendar: create(:agenda_calendar, organization: organization))

      get "/calendars/#{calendar.id}/availability", params: { serviceId: other.id.to_s, start: "2030-01-14", end: "2030-01-20" }, headers: headers

      expect(response).to have_http_status(:not_found)
    end

    it "data ilegível é 422" do
      get "/calendars/#{calendar.id}/availability", params: { serviceId: service.id.to_s, start: "ontem", end: "2030-01-20" }, headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("invalidTime")
    end
  end
end
