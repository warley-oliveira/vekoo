require "rails_helper"

# O cliente do Google de verdade, com a rede fechada: o que cada stub confere é o pedido que sairia.
RSpec.describe "Google Agenda" do
  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_google_calendar, organization: organization) }
  let(:calendar) { create(:agenda_calendar, organization: organization, time_zone: "America/Sao_Paulo", google_calendar_connector_id: connector.id.to_s) }
  let(:events_url) { "https://www.googleapis.com/calendar/v3/calendars/#{CGI.escape(connector.google_calendar_id)}/events" }
  let(:google_env) do
    { "GOOGLE_CALENDAR_CLIENT_ID" => "client-id", "GOOGLE_CALENDAR_CLIENT_SECRET" => "client-secret", "GOOGLE_CALENDAR_REDIRECT_URI" => "https://app.exemplo.com/google/callback" }
  end

  around { |example| with_env(google_env) { example.run } }

  def stub_events(pages)
    stub_request(:get, events_url).with(query: hash_including({})).to_return(*pages.map { |page| json_reply(page) })
  end

  def google_event(id, start_at: "2030-07-01T13:00:00Z", end_at: "2030-07-01T14:00:00Z", **attributes)
    {
      id: id, status: "confirmed", summary: "Consulta", description: "desc",
      start: { dateTime: start_at }, end: { dateTime: end_at }
    }.merge(attributes)
  end

  describe Agenda::GoogleClient do
    describe ".configured?" do
      it "precisa das três variáveis" do
        expect(described_class).to be_configured

        with_env("GOOGLE_CALENDAR_CLIENT_SECRET" => nil) { expect(described_class).not_to be_configured }
      end
    end

    describe ".authorization_url" do
      it "pede acesso offline, com o state, e o consentimento que garante o refresh_token" do
        url = URI.parse(described_class.authorization_url(state: "abc"))
        query = Rack::Utils.parse_query(url.query)

        expect(url.host).to eq("accounts.google.com")
        expect(query).to include("state" => "abc", "access_type" => "offline", "prompt" => "consent", "client_id" => "client-id", "redirect_uri" => "https://app.exemplo.com/google/callback")
        expect(query["scope"]).to include("calendar.app.created")
      end
    end

    describe ".email_from" do
      it "lê o e-mail do id_token" do
        payload = Base64.urlsafe_encode64({ email: "ana@gmail.com" }.to_json, padding: false)

        expect(described_class.email_from("id_token" => "h.#{payload}.s")).to eq("ana@gmail.com")
      end

      it "sem id_token, ou quebrado, é nil" do
        expect(described_class.email_from({})).to be_nil
        expect(described_class.email_from("id_token" => "h.@@@.s")).to be_nil
      end
    end

    describe "token de acesso" do
      let(:client) { connector.client }

      it "usa o que ainda vale, sem renovar" do
        stub = stub_request(:get, events_url).with(query: hash_including({}), headers: { "Authorization" => "Bearer access-do-google" }).to_return(json_reply({ items: [] }))

        client.sync_events(time_min: 1.day.ago)

        expect(stub).to have_been_requested
      end

      it "renova o vencido e grava cifrado" do
        connector.update!(token_expires_at: 1.minute.ago)
        token = stub_request(:post, "https://oauth2.googleapis.com/token").to_return(json_reply({ access_token: "novo", expires_in: 3600 }))
        stub_request(:get, events_url).with(query: hash_including({}), headers: { "Authorization" => "Bearer novo" }).to_return(json_reply({ items: [] }))

        client.sync_events(time_min: 1.day.ago)

        expect(token).to have_been_requested
        expect(connector.reload.access_token).to eq("novo")
        expect(connector.token_expires_at).to be > 50.minutes.from_now
        expect(stored_document(connector)).not_to have_key("access_token")
      end

      it "acesso revogado marca o conector, avisa a organização e levanta" do
        connector.update!(token_expires_at: 1.minute.ago)
        stub_request(:post, "https://oauth2.googleapis.com/token").to_return(json_reply({ error: "invalid_grant" }, status: 400))

        expect { client.sync_events(time_min: 1.day.ago) }.to raise_error(Agenda::GoogleClient::Revoked)

        expect(connector.reload).to be_failed
        expect(connector.error_message).to be_present
        expect(OrganizationAlert.where(organization_id: organization.id, code: "google_calendar_revoked")).to exist
      end

      it "sem refresh_token, levanta sem chamar o Google" do
        connector.update!(token_expires_at: 1.minute.ago, refresh_token: nil)

        expect { client.sync_events(time_min: 1.day.ago) }.to raise_error(Agenda::GoogleClient::Revoked)
      end
    end

    describe "#watch" do
      it "abre o canal com o nosso token e devolve a validade" do
        stub = stub_request(:post, "#{events_url}/watch").with { |request|
          body = JSON.parse(request.body)
          body["token"] == "segredo" && body["address"] == "https://api.exemplo.com/in" && body["params"] == { "ttl" => "604800" }
        }.to_return(json_reply({ id: "canal", resourceId: "recurso", expiration: "1893456000000" }))

        watch = connector.client.watch(address: "https://api.exemplo.com/in", channel_token: "segredo")

        expect(stub).to have_been_requested
        expect(watch).to have_attributes(id: "canal", resource_id: "recurso")
        expect(watch.expires_at.to_i).to eq(1_893_456_000)
      end
    end

    describe "#delete_event" do
      it "evento que já não existe não é erro" do
        stub_request(:delete, "#{events_url}/ev-1").to_return(status: 410, body: "{}", headers: { "Content-Type" => "application/json" })

        expect { connector.client.delete_event("ev-1") }.not_to raise_error
      end
    end
  end

  describe Connector::GoogleCalendar do
    it "não entra na lista de canais" do
      connector
      channel = create(:connector_web_widget, organization: organization)

      expect(Connector::Base.channels.where(organization_id: organization.id.to_s).to_a).to eq([ channel ])
    end

    it "guarda os tokens cifrados" do
      document = stored_document(connector)

      expect(document).to have_key("refresh_token_ciphertext")
      expect(document).not_to have_key("refresh_token")
      expect(connector.reload.refresh_token).to eq("refresh-do-google")
    end

    it "desconectar apaga os tokens e o estado do canal" do
      connector.deactivate

      expect(connector.reload).to have_attributes(status: :closed, refresh_token: nil, access_token: nil, sync_token: nil, watch_expires_at: nil)
    end

    it "confere o token do canal" do
      expect(connector.valid_channel_token?("token-do-canal")).to be(true)
      expect(connector.valid_channel_token?("outro")).to be(false)
      expect(connector.valid_channel_token?(nil)).to be(false)
    end

    it "reconexão sem refresh_token novo fica com o anterior" do
      connector.store_authorization!("access_token" => "novo", "expires_in" => 3600)

      expect(connector.reload).to have_attributes(refresh_token: "refresh-do-google", access_token: "novo", status: :active)
    end
  end

  describe Agenda::GoogleCalendarSyncService do
    subject(:sync) { described_class.new(connector).call }

    before { calendar }

    it "sem token, lê a janela de 30 dias e guarda o token novo" do
      stub = stub_request(:get, events_url).with(query: hash_including("singleEvents" => "true", "showDeleted" => "true"))
                                           .to_return(json_reply({ items: [], nextSyncToken: "TOKEN-1" }))

      sync

      expect(stub).to have_been_requested
      expect(connector.reload.sync_token).to eq("TOKEN-1")
    end

    it "com token, lê só o que mudou" do
      connector.update!(sync_token: "ANTES")
      stub = stub_request(:get, events_url).with(query: { "syncToken" => "ANTES" }).to_return(json_reply({ items: [], nextSyncToken: "DEPOIS" }))

      sync

      expect(stub).to have_been_requested
      expect(connector.reload.sync_token).to eq("DEPOIS")
    end

    it "percorre as páginas, e guarda o token da última" do
      stub_events([ { items: [ google_event("a") ], nextPageToken: "P2" }, { items: [ google_event("b") ], nextSyncToken: "FIM" } ])

      sync

      expect(Agenda::Booking.pluck(:google_event_id)).to contain_exactly("a", "b")
      expect(connector.reload.sync_token).to eq("FIM")
    end

    it "token vencido (410): limpa e lê a janela inteira" do
      connector.update!(sync_token: "VELHO")
      stub_request(:get, events_url).with(query: { "syncToken" => "VELHO" })
                                    .to_return(status: 410, body: { error: { message: "gone" } }.to_json, headers: { "Content-Type" => "application/json" })
      full = stub_request(:get, events_url).with(query: hash_including("singleEvents" => "true")).to_return(json_reply({ items: [], nextSyncToken: "NOVO" }))

      sync

      expect(full).to have_been_requested
      expect(connector.reload.sync_token).to eq("NOVO")
    end

    it "outro erro do Google sobe, para o job decidir" do
      stub_request(:get, events_url).with(query: hash_including({}))
                                    .to_return(status: 400, body: { error: { message: "bad" } }.to_json, headers: { "Content-Type" => "application/json" })

      expect { sync }.to raise_error(Google::Apis::ClientError)
    end

    describe "evento novo" do
      it "vira agendamento no calendário, sem avisar ninguém e sem voltar para o Google" do
        stub_events([ { items: [ google_event("ev-1", hangoutLink: "https://meet.google.com/abc") ], nextSyncToken: "T" } ])

        expect { sync }.not_to have_enqueued_job

        booking = Agenda::Booking.where(google_event_id: "ev-1").take
        expect(booking).to have_attributes(calendar_id: calendar.id, connector_id: connector.id, title: "Consulta", google_meet_url: "https://meet.google.com/abc")
        expect(booking.start).to eq(Time.utc(2030, 7, 1, 13, 0))
      end

      it "atribui o profissional pelo e-mail do convidado, sem diferenciar maiúscula" do
        professional = create(:agenda_professional, calendar: calendar, email: "pro@clinica.com")
        stub_events([ { items: [ google_event("ev-1", attendees: [ { email: "PRO@Clinica.com" } ]) ], nextSyncToken: "T" } ])

        sync

        expect(Agenda::Booking.where(google_event_id: "ev-1").take.professional_id).to eq(professional.id)
      end

      it "convidado que não é profissional deixa em branco" do
        stub_events([ { items: [ google_event("ev-1", attendees: [ { email: "fora@x.com" } ]) ], nextSyncToken: "T" } ])

        sync

        expect(Agenda::Booking.where(google_event_id: "ev-1").take.professional_id).to be_nil
      end

      it "evento de dia inteiro começa à meia-noite no fuso do calendário, sem ficar sem horário como na origem" do
        stub_events([ { items: [ { id: "dia", status: "confirmed", summary: "Feriado", start: { date: "2030-07-01" }, end: { date: "2030-07-02" } } ], nextSyncToken: "T" } ])

        sync

        booking = Agenda::Booking.where(google_event_id: "dia").take
        expect(booking.start).to eq(Time.utc(2030, 7, 1, 3, 0))
        expect(booking.end).to eq(Time.utc(2030, 7, 2, 3, 0))
      end

      it "usa a cor do Google" do
        stub_request(:get, "https://www.googleapis.com/calendar/v3/colors").to_return(json_reply({ event: { "5" => { background: "#fbd75b", foreground: "#000" } } }))
        stub_events([ { items: [ google_event("ev-1", colorId: "5") ], nextSyncToken: "T" } ])

        sync

        expect(Agenda::Booking.where(google_event_id: "ev-1").take.color).to eq("#fbd75b")
      end
    end

    describe "evento que já existe" do
      let!(:booking) do
        create(:agenda_booking, calendar: calendar, connector_id: connector.id, google_event_id: "ev-2", title: "Antigo",
               google_meet_url: "https://meet.google.com/antigo", skip_google_push: true, skip_professional_notifications: true)
      end

      it "atualiza sem voltar para o Google" do
        stub_events([ { items: [ google_event("ev-2") ], nextSyncToken: "T" } ])

        expect { sync }.not_to have_enqueued_job(Agenda::GooglePushJob)

        expect(booking.reload).to have_attributes(title: "Consulta", start: Time.utc(2030, 7, 1, 13, 0))
      end

      it "sem o link no aviso, não apaga o que já estava gravado" do
        stub_events([ { items: [ google_event("ev-2") ], nextSyncToken: "T" } ])

        sync

        expect(booking.reload.google_meet_url).to eq("https://meet.google.com/antigo")
      end

      it "com o link no aviso, atualiza" do
        stub_events([ { items: [ google_event("ev-2", hangoutLink: "https://meet.google.com/novo") ], nextSyncToken: "T" } ])

        sync

        expect(booking.reload.google_meet_url).to eq("https://meet.google.com/novo")
      end

      it "apagado no Google, cancela sem mandar apagar de volta" do
        stub_events([ { items: [ { id: "ev-2", status: "cancelled" } ], nextSyncToken: "T" } ])

        expect { sync }.not_to have_enqueued_job(Agenda::GoogleDeleteJob)

        expect(booking.reload).to be_canceled
      end
    end

    it "cancelamento de evento desconhecido é ignorado" do
      stub_events([ { items: [ { id: "nada", status: "cancelled" } ], nextSyncToken: "T" } ])

      expect { sync }.not_to raise_error
    end
  end

  describe Agenda::GooglePushJob do
    let(:start_at) { calendar.zone.local(2030, 7, 1, 10, 0) }
    let(:professional) { create(:agenda_professional, calendar: calendar, email: "pro@clinica.com") }
    let(:booking) do
      create(:agenda_booking, calendar: calendar, professional: professional, title: "Consulta", description: "desc",
             start: start_at, end: start_at + 1.hour, skip_professional_notifications: true)
    end

    def perform
      described_class.perform_now(booking.id.to_s, organization.id.to_s)
    end

    it "cria o evento com convidado, Meet e fuso, e guarda o id e o link" do
      stub = stub_request(:post, events_url).with(query: hash_including("conferenceDataVersion" => "1")) { |request|
        body = JSON.parse(request.body)
        body["summary"] == "Consulta" && body["attendees"] == [ { "email" => "pro@clinica.com" } ] &&
          body.dig("start", "timeZone") == "America/Sao_Paulo" && body.dig("conferenceData", "createRequest", "conferenceSolutionKey", "type") == "hangoutsMeet"
      }.to_return(json_reply({ id: "ev-9", hangoutLink: "https://meet.google.com/xyz" }))

      perform

      expect(stub).to have_been_requested
      expect(booking.reload).to have_attributes(google_event_id: "ev-9", google_meet_url: "https://meet.google.com/xyz", connector_id: connector.id)
    end

    it "avisa o calendário quando o link chega" do
      stub_request(:post, events_url).with(query: hash_including({})).to_return(json_reply({ id: "ev-9", hangoutLink: "https://meet.google.com/xyz" }))
      booking

      expect { perform }.to have_broadcasted_to(AgendaChannel.organization_stream(organization.id, "agenda")).with(hash_including(action: "update"))
    end

    it "com id, atualiza o evento" do
      booking.set(google_event_id: "ev-9")
      stub_request(:get, "#{events_url}/ev-9").to_return(json_reply({ id: "ev-9", summary: "Velho" }))
      stub = stub_request(:put, "#{events_url}/ev-9").with { |request| JSON.parse(request.body)["summary"] == "Consulta" }.to_return(json_reply({ id: "ev-9" }))

      perform

      expect(stub).to have_been_requested
    end

    it "conector desligado: não chama o Google" do
      connector.update!(status: :closed)

      expect { perform }.not_to raise_error
    end

    it "acesso revogado: desiste sem nova tentativa" do
      connector.update!(token_expires_at: 1.minute.ago)
      stub_request(:post, "https://oauth2.googleapis.com/token").to_return(json_reply({ error: "invalid_grant" }, status: 400))

      expect { perform }.not_to raise_error
      expect(connector.reload).to be_failed
    end

    it "evento recusado pelo Google não vira nova tentativa" do
      stub_request(:post, events_url).with(query: hash_including({})).to_return(status: 404, body: { error: { message: "nope" } }.to_json, headers: { "Content-Type" => "application/json" })

      expect { perform }.not_to raise_error
      expect(booking.reload.google_event_id).to be_nil
    end

    it "com outro job no mesmo agendamento, tenta de novo depois, em vez de criar dois eventos" do
      Rails.cache.write("agenda.google_push.#{booking.id}", true)

      expect { perform }.to have_enqueued_job(described_class)
    ensure
      Rails.cache.delete("agenda.google_push.#{booking.id}")
    end
  end

  describe Agenda::GoogleDeleteJob do
    it "apaga o evento" do
      stub = stub_request(:delete, "#{events_url}/ev-1").to_return(status: 204)

      described_class.perform_now(connector.id.to_s, organization.id.to_s, "ev-1")

      expect(stub).to have_been_requested
    end

    it "não alcança conector de outra organização" do
      described_class.perform_now(connector.id.to_s, create(:organization).id.to_s, "ev-1")

      expect(a_request(:delete, /googleapis/)).not_to have_been_made
    end
  end

  describe Agenda::GoogleCalendarWatchRefreshJob do
    it "renova quem vence logo e quem nunca teve canal" do
      due = create(:connector_google_calendar, organization: organization, watch_expires_at: 1.day.from_now)
      never = create(:connector_google_calendar, organization: organization, watch_expires_at: nil)
      create(:connector_google_calendar, organization: organization, watch_expires_at: 6.days.from_now)
      create(:connector_google_calendar, organization: organization, status: :closed, watch_expires_at: nil)

      expect { described_class.perform_now }.to have_enqueued_job(Agenda::ActiveGoogleEventJob).exactly(2).times
        .and(have_enqueued_job(Agenda::ActiveGoogleEventJob).with(due.id.to_s, organization.id.to_s))
        .and(have_enqueued_job(Agenda::ActiveGoogleEventJob).with(never.id.to_s, organization.id.to_s))
    end
  end

  describe Agenda::ActiveGoogleEventJob do
    it "abre o canal e guarda o estado" do
      stub_request(:post, "#{events_url}/watch").to_return(json_reply({ id: "canal", resourceId: "recurso", expiration: "1893456000000" }))

      described_class.perform_now(connector.id.to_s, organization.id.to_s)

      expect(connector.reload).to have_attributes(google_channel_id: "canal", google_resource_id: "recurso")
      expect(connector.watch_expires_at.to_i).to eq(1_893_456_000)
    end

    it "cria o calendário do app quando ainda não existe" do
      connector.update!(google_calendar_id: nil)
      stub_request(:post, "https://www.googleapis.com/calendar/v3/calendars").to_return(json_reply({ id: "novo@group.calendar.google.com" }))
      stub_request(:post, %r{calendars/novo@group\.calendar\.google\.com/events/watch}).to_return(json_reply({ id: "canal", resourceId: "r", expiration: "1893456000000" }))

      described_class.perform_now(connector.id.to_s, organization.id.to_s)

      expect(connector.reload.google_calendar_id).to eq("novo@group.calendar.google.com")
    end
  end

  describe Agenda::GoogleCalendarSyncJob do
    it "sincroniza o conector ativo" do
      calendar
      stub = stub_events([ { items: [], nextSyncToken: "T" } ])

      described_class.perform_now(connector.id.to_s, organization.id.to_s)

      expect(stub).to have_been_requested
    end

    it "não faz nada com o conector desligado, nem em outra organização" do
      calendar
      connector.update!(status: :closed)
      described_class.perform_now(connector.id.to_s, organization.id.to_s)

      other = create(:connector_google_calendar, organization: organization)
      described_class.perform_now(other.id.to_s, create(:organization).id.to_s)

      expect(a_request(:get, /googleapis/)).not_to have_been_made
    end
  end
end
