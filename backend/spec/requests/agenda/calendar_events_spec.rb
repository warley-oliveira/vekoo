require "rails_helper"

RSpec.describe "Agenda: eventos do calendário", type: :request do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization, timezone: "America/Sao_Paulo") }
  let(:account) { create(:account, organization: organization, name: "Marina Duarte") }
  let(:headers) { auth_headers(account) }
  let(:calendar) { create(:agenda_calendar, organization: organization, time_zone: "America/Sao_Paulo") }
  let(:chat) { create(:chat, organization_id: organization.id, user_name: "Maria") }
  let(:professional) { create(:agenda_professional, calendar: calendar, name: "Dra. Ana") }
  let(:service) { create(:agenda_offering, calendar: calendar, name: "Limpeza", professionals: [ professional ]) }

  def booking(at: calendar.zone.local(2030, 1, 14, 15, 0), **attributes)
    create(:agenda_booking, { calendar: calendar, start: at, end: at + 1.hour, skip_professional_notifications: true }.merge(attributes))
  end

  def window(**params)
    { start: "2030-01-14T00:00:00-03:00", end: "2030-01-20T23:59:59-03:00" }.merge(params)
  end

  def ids
    json["events"].map { |event| event["id"] }
  end

  describe "sessão e permissão" do
    [
      [ :get, "/calendar-events" ],
      [ :post, "/calendar-events" ],
      [ :patch, "/calendar-events/qualquer" ],
      [ :delete, "/calendar-events/qualquer" ],
      [ :get, "/calendar-events/month-counts" ],
      [ :get, "/calendar-events/filters" ],
      [ :post, "/calendar-events/qualquer/sequence" ],
      [ :delete, "/calendar-events/qualquer/sequence" ]
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

  describe "GET /calendar-events" do
    it "lista o intervalo, em milissegundos e camelCase" do
      record = booking(chat: chat, professional: professional, service: service, event_user_name: "Marina")
      booking(at: calendar.zone.local(2030, 2, 1, 10, 0))

      get "/calendar-events", params: window, headers: headers

      expect(response).to have_http_status(:ok)
      event = json["events"].sole
      expect(event).to include(
        "id" => record.id.to_s, "type" => "booking", "calendarId" => calendar.id.to_s, "userName" => "Maria",
        "professionalName" => "Dra. Ana", "serviceName" => "Limpeza", "contactExternalId" => chat.external_id,
        "status" => "active", "attendanceStatus" => nil, "start" => Time.utc(2030, 1, 14, 18, 0).to_i * 1000,
        "end" => Time.utc(2030, 1, 14, 19, 0).to_i * 1000
      )
      expect(event["eventHistory"].first).to include("eventName" => "create", "userName" => "Marina", "byUser" => true)
      expect(event["eventHistory"].first["updatedAt"]).to be_a(Integer)
    end

    it "não mostra o de outra organização, e nem o arquivado" do
      booking
      create(:agenda_booking, start: calendar.zone.local(2030, 1, 15, 10, 0), end: calendar.zone.local(2030, 1, 15, 11, 0))
      booking(at: calendar.zone.local(2030, 1, 16, 10, 0)).update!(status: "archived")

      get "/calendar-events", params: window, headers: headers

      expect(json["events"].size).to eq(1)
    end

    it "sem intervalo, é a semana atual no fuso da organização" do
      travel_to(calendar.zone.local(2030, 1, 16, 12, 0)) do
        inside = booking(at: calendar.zone.local(2030, 1, 14, 9, 0))
        booking(at: calendar.zone.local(2030, 1, 13, 23, 0))

        get "/calendar-events", headers: headers

        expect(ids).to eq([ inside.id.to_s ])
      end
    end

    it "o intervalo vale no instante, e não na data de UTC" do
      # 22:30 de domingo em São Paulo já é segunda em UTC.
      late = booking(at: calendar.zone.local(2030, 1, 13, 22, 30))

      get "/calendar-events", params: { start: "2030-01-13", end: "2030-01-13 23:59" }, headers: headers
      expect(ids).to eq([ late.id.to_s ])

      get "/calendar-events", params: { start: "2030-01-14", end: "2030-01-14 23:59" }, headers: headers
      expect(ids).to be_empty
    end

    it "aceita milissegundos no intervalo, os mesmos que devolve" do
      record = booking

      get "/calendar-events", params: { start: (record.start.to_f * 1000).to_i - 1, end: (record.start.to_f * 1000).to_i + 1 }, headers: headers

      expect(ids).to eq([ record.id.to_s ])
    end

    it "intervalo ilegível é 422" do
      get "/calendar-events", params: { start: "ontem", end: "hoje" }, headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("invalidTime")
    end

    it "intervalo grande demais é 422, para não travar uma thread" do
      get "/calendar-events", params: { start: "2030-01-01", end: "2032-01-01" }, headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("rangeTooLong")
    end

    describe "filtros" do
      it "por calendário, em lista separada por vírgula" do
        other_calendar = create(:agenda_calendar, organization: organization)
        first = booking
        second = booking(calendar: other_calendar)
        booking(calendar: create(:agenda_calendar, organization: organization))

        get "/calendar-events", params: window(calendarIds: "#{calendar.id},#{other_calendar.id}"), headers: headers

        expect(ids).to contain_exactly(first.id.to_s, second.id.to_s)
      end

      it "por serviço e por profissional" do
        match = booking(professional: professional, service: service)
        booking

        get "/calendar-events", params: window(serviceIds: service.id.to_s), headers: headers
        expect(ids).to eq([ match.id.to_s ])

        get "/calendar-events", params: window(professionalIds: professional.id.to_s), headers: headers
        expect(ids).to eq([ match.id.to_s ])
      end

      it "por etiqueta da conversa" do
        tag = chat.add_tag!("vip")
        match = booking(chat: chat)
        booking(chat: create(:chat, organization_id: organization.id))
        booking

        get "/calendar-events", params: window(tagIds: tag.id.to_s), headers: headers

        expect(ids).to eq([ match.id.to_s ])
      end

      it "id de calendário de outra organização não acha nada" do
        booking

        get "/calendar-events", params: window(calendarIds: create(:agenda_calendar).id.to_s), headers: headers

        expect(ids).to be_empty
      end

      it "id que não é id não acha nada, sem erro" do
        booking

        get "/calendar-events", params: window(calendarIds: "lixo"), headers: headers

        expect(response).to have_http_status(:ok)
        expect(ids).to be_empty
      end
    end

    describe "por conversa" do
      it "traz todos os agendamentos dela, sem janela e sem aulas" do
        past = booking(chat: chat, at: calendar.zone.local(2028, 1, 14, 15, 0))
        future = booking(chat: chat, at: calendar.zone.local(2032, 1, 14, 15, 0))
        booking

        get "/calendar-events", params: { chatId: chat.id.to_s }, headers: headers

        expect(ids).to eq([ past.id.to_s, future.id.to_s ])
      end

      it "id quebrado não pega agendamento sem conversa" do
        booking

        get "/calendar-events", params: { chatId: "lixo" }, headers: headers

        expect(ids).to be_empty
      end

      it "conversa de outra organização não traz nada" do
        foreign_organization = create(:organization)
        foreign = create(:agenda_booking, calendar: create(:agenda_calendar, organization: foreign_organization), chat: create(:chat, organization_id: foreign_organization.id))

        get "/calendar-events", params: { chatId: foreign.chat_id.to_s }, headers: headers

        expect(ids).to be_empty
      end
    end

    describe "com turmas" do
      let(:class_calendar) { create(:agenda_calendar, :class_group, organization: organization) }
      let!(:group) { create(:agenda_class_group, calendar: class_calendar, name: "Pilates", start_date: Date.new(2030, 1, 1)) }

      it "junta as aulas calculadas, com a hora no fuso do calendário" do
        record = booking

        get "/calendar-events", params: window, headers: headers

        sessions = json["events"].select { |event| event["type"] == "class_session" }
        expect(ids).to include(record.id.to_s)
        expect(sessions.map { |event| event["id"] }).to eq([ "vcs_#{group.id}_20300114_0800", "vcs_#{group.id}_20300116_0800" ])
        expect(sessions.first).to include("virtual" => true, "title" => "Pilates", "start" => Time.utc(2030, 1, 14, 11, 0).to_i * 1000)
      end

      it "filtro de agendamento deixa as aulas de fora" do
        get "/calendar-events", params: window(professionalIds: professional.id.to_s), headers: headers

        expect(ids).to be_empty
      end

      it "filtro por calendário vale para as aulas" do
        get "/calendar-events", params: window(calendarIds: calendar.id.to_s), headers: headers
        expect(ids).to be_empty

        get "/calendar-events", params: window(calendarIds: class_calendar.id.to_s), headers: headers
        expect(ids.size).to eq(2)
      end

      it "turma de outra organização não aparece" do
        create(:agenda_class_group, name: "Alheia")

        get "/calendar-events", params: window, headers: headers

        expect(json["events"].map { |event| event["title"] }).not_to include("Alheia")
      end
    end
  end

  describe "POST /calendar-events" do
    def create_event(**attributes)
      post "/calendar-events", params: { event: { calendarId: calendar.id.to_s, start: "2030-01-14 15:00", end: "2030-01-14 16:00", title: "Avaliação" }.merge(attributes) }, headers: headers, as: :json
    end

    it "cria, com a hora de parede no fuso do calendário" do
      create_event(chatId: chat.id.to_s, professionalId: professional.id.to_s, serviceId: service.id.to_s, description: "Primeira vez")

      expect(response).to have_http_status(:created)
      expect(json).to include("title" => "Avaliação", "description" => "Primeira vez", "serviceId" => service.id.to_s, "chatId" => chat.id.to_s, "contactExternalId" => chat.external_id)
      expect(json["start"]).to eq(Time.utc(2030, 1, 14, 18, 0).to_i * 1000)
      expect(json["eventHistory"].first).to include("eventName" => "create", "userName" => "Marina Duarte")
    end

    it "em outro fuso, a mesma hora de parede é outro instante" do
      calendar.update!(time_zone: "Asia/Tokyo")

      create_event

      expect(json["start"]).to eq(Time.utc(2030, 1, 14, 6, 0).to_i * 1000)
    end

    it "aceita ISO com deslocamento e milissegundos" do
      create_event(start: "2030-01-14T18:00:00Z", end: Time.utc(2030, 1, 14, 19, 0).to_i * 1000)

      expect(json["start"]).to eq(Time.utc(2030, 1, 14, 18, 0).to_i * 1000)
      expect(json["end"]).to eq(Time.utc(2030, 1, 14, 19, 0).to_i * 1000)
    end

    it "avisa o calendário e a conversa" do
      expect { create_event(chatId: chat.id.to_s) }
        .to have_broadcasted_to(AgendaChannel.organization_stream(organization.id, "agenda")).with(hash_including(action: "create", type: "booking"))
    end

    it "sem envelope é 400" do
      post "/calendar-events", params: { start: "2030-01-14" }, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
    end

    it "sem horário é 422" do
      create_event(start: nil)

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json["error"]["field"]).to eq("start")
    end

    it "fim antes do início é 422" do
      create_event(end: "2030-01-14 14:00")

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json["error"]["field"]).to eq("end")
    end

    it "horário ilegível é 422" do
      create_event(start: "amanhã cedo")

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("invalidTime")
    end

    describe "isolamento" do
      it "calendário de outra organização é 422, como se não existisse" do
        create_event(calendarId: create(:agenda_calendar).id.to_s)

        expect(response).to have_http_status(:unprocessable_entity)
        expect(Agenda::Booking.count).to eq(0)
      end

      it "conversa de outra organização é 422" do
        create_event(chatId: create(:chat, organization_id: create(:organization).id).id.to_s)

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json["error"]["field"]).to eq("chatId")
      end

      it "profissional e serviço de outro calendário são 422" do
        create_event(professionalId: create(:agenda_professional).id.to_s)
        expect(json["error"]["field"]).to eq("professionalId")

        create_event(serviceId: create(:agenda_offering).id.to_s)
        expect(json["error"]["field"]).to eq("serviceId")
      end

      it "a organização do corpo é ignorada" do
        create_event(organizationId: create(:organization).id)

        expect(Agenda::Booking.find(json["id"]).organization_id).to eq(organization.id.to_s)
      end
    end
  end

  describe "PATCH /calendar-events/:id" do
    let(:record) { booking(chat: chat) }

    def update_event(**attributes)
      patch "/calendar-events/#{record.id}", params: { event: attributes }, headers: headers, as: :json
    end

    it "muda o horário no fuso do calendário, e diz quem foi" do
      update_event(start: "2030-01-15 10:00", end: "2030-01-15 11:00")

      expect(response).to have_http_status(:ok)
      expect(json["start"]).to eq(Time.utc(2030, 1, 15, 13, 0).to_i * 1000)
      expect(json["eventHistory"].last).to include("eventName" => "time_update", "userName" => "Marina Duarte", "byUser" => true)
      expect(json["eventHistory"].last["start"].last).to eq(Time.utc(2030, 1, 15, 13, 0).to_i * 1000)
    end

    it "marca o comparecimento e etiqueta a conversa" do
      update_event(attendanceStatus: "show")

      expect(json["attendanceStatus"]).to eq("show")
      expect(chat.reload.chat_tags.map(&:name)).to eq([ "compareceu" ])
    end

    it "texto vazio limpa o comparecimento" do
      record.update!(attendance_status: "show")

      update_event(attendanceStatus: "")

      expect(response).to have_http_status(:ok)
      expect(json["attendanceStatus"]).to be_nil
    end

    it "comparecimento que não existe é 422" do
      update_event(attendanceStatus: "talvez")

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "cancela" do
      update_event(status: "canceled")

      expect(json).to include("status" => "canceled", "color" => Agenda::Booking::CANCELED_COLOR)
    end

    it "tira e põe a conversa" do
      update_event(chatId: nil)
      expect(json).to include("chatId" => nil, "contactExternalId" => nil)

      update_event(chatId: chat.id.to_s)
      expect(json).to include("chatId" => chat.id.to_s, "contactExternalId" => chat.external_id)
    end

    it "não muda o calendário pelo corpo" do
      other = create(:agenda_calendar, organization: organization)

      update_event(calendarId: other.id.to_s, title: "X")

      expect(record.reload.calendar_id).to eq(calendar.id)
    end

    it "de outra organização é 404, e nada muda" do
      foreign = create(:agenda_booking)

      patch "/calendar-events/#{foreign.id}", params: { event: { title: "Invadido" } }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(foreign.reload.title).not_to eq("Invadido")
    end
  end

  describe "DELETE /calendar-events/:id" do
    it "arquiva: some da lista, e fica no banco com o histórico" do
      record = booking

      delete "/calendar-events/#{record.id}", headers: headers, as: :json

      expect(response).to have_http_status(:no_content)
      expect(record.reload).to be_archived
      expect(record.event_history.last).to include("event_name" => "archived", "user_name" => "Marina Duarte")

      get "/calendar-events", params: window, headers: headers
      expect(json["events"]).to be_empty
    end

    it "de outra organização é 404" do
      delete "/calendar-events/#{create(:agenda_booking).id}", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "sequência" do
    let(:sequence) do
      {
        "id" => "seq-1", "name" => "Recuperar", "trigger" => "no_show", "enabled" => true,
        "steps" => [ { "id" => "s1", "message" => "Oi", "run_after" => 1, "run_after_unit" => "hours", "all_day" => true } ]
      }
    end
    let(:record) { booking(chat: chat, attendance_status: "no_show") }

    before { calendar.update!(attendance_sequences: [ sequence ]) }

    describe "POST /calendar-events/:id/sequence" do
      it "inscreve, e devolve quando sai cada passo" do
        expect {
          post "/calendar-events/#{record.id}/sequence", params: { sequenceId: "seq-1" }, headers: headers, as: :json
        }.to have_enqueued_job(Agenda::AttendanceSequenceJob)

        expect(response).to have_http_status(:ok)
        expect(json["enrolledSequenceId"]).to eq("seq-1")
        expect(json["steps"].first).to include("stepId" => "s1")
        expect(json["steps"].first["runAt"]).to be_a(Integer)
      end

      it "o histórico diz quem inscreveu" do
        post "/calendar-events/#{record.id}/sequence", params: { sequenceId: "seq-1" }, headers: headers, as: :json

        expect(record.reload.event_history.last).to include("event_name" => "sequence_enrolled", "user_name" => "Marina Duarte", "by_user" => true)
      end

      it "sequência que não existe é 422 com o motivo" do
        post "/calendar-events/#{record.id}/sequence", params: { sequenceId: "outra" }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json.dig("error", "code")).to eq("sequenceNotFound")
        expect(json.dig("error", "message")).to be_present
      end

      it "sem sequência é 400" do
        post "/calendar-events/#{record.id}/sequence", headers: headers, as: :json

        expect(response).to have_http_status(:bad_request)
      end

      it "de outra organização é 404" do
        post "/calendar-events/#{create(:agenda_booking).id}/sequence", params: { sequenceId: "seq-1" }, headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
      end
    end

    describe "DELETE /calendar-events/:id/sequence" do
      it "cancela a inscrição: o token morre, e registra no histórico" do
        record.update!(sequence_token: "t", enrolled_sequence_id: "seq-1", sequence_enrolled_at: Time.current)

        delete "/calendar-events/#{record.id}/sequence", headers: headers, as: :json

        expect(response).to have_http_status(:no_content)
        expect(record.reload).to have_attributes(sequence_token: nil, enrolled_sequence_id: nil, sequence_enrolled_at: nil)
        expect(record.event_history.last).to include("event_name" => "sequence_unenrolled", "sequence_id" => "seq-1")
      end
    end
  end

  describe "GET /calendar-events/month-counts" do
    before { Rails.cache.clear }

    it "conta por dia no fuso da organização, sem cancelado nem arquivado" do
      booking(at: calendar.zone.local(2030, 1, 14, 22, 30))
      booking(at: calendar.zone.local(2030, 1, 14, 9, 0))
      booking(at: calendar.zone.local(2030, 1, 15, 9, 0)).update!(status: "canceled")
      booking(at: calendar.zone.local(2030, 1, 15, 10, 0)).update!(status: "archived")

      get "/calendar-events/month-counts", params: { start: "2030-01-01", end: "2030-01-31" }, headers: headers

      expect(json).to eq("2030-01-14" => 2)
    end

    it "conta as aulas calculadas, e deixa a cancelada de fora" do
      class_calendar = create(:agenda_calendar, :class_group, organization: organization)
      group = create(:agenda_class_group, calendar: class_calendar, start_date: Date.new(2030, 1, 14), end_date: Date.new(2030, 1, 16))
      start_at = class_calendar.zone.local(2030, 1, 16, 8, 0)
      create(:agenda_class_session, class_group: group, start: start_at, end: start_at + 1.hour, status: "canceled")

      get "/calendar-events/month-counts", params: { start: "2030-01-01", end: "2030-01-31" }, headers: headers

      expect(json).to eq("2030-01-14" => 1)
    end

    it "não conta de outra organização" do
      create(:agenda_booking, start: calendar.zone.local(2030, 1, 14, 9, 0), end: calendar.zone.local(2030, 1, 14, 10, 0))

      get "/calendar-events/month-counts", params: { start: "2030-01-01", end: "2030-01-31" }, headers: headers

      expect(json).to eq({})
    end
  end

  describe "GET /calendar-events/filters" do
    it "traz as opções da organização, sem as de outra" do
      calendar
      professional
      service
      tag = chat.add_tag!("vip")
      team = create(:team, organization: organization, name: "Atendimento")
      create(:agenda_professional)

      get "/calendar-events/filters", headers: headers

      expect(json["calendars"].map { |item| item["id"] }).to eq([ calendar.id.to_s ])
      expect(json["calendars"].first).to include("timeZone" => "America/Sao_Paulo", "calendarType" => "professional")
      expect(json["professionals"].map { |item| item["name"] }).to include("Dra. Ana")
      expect(json["professionals"].size).to eq(Agenda::Professional.where(organization_id: organization.id.to_s).count)
      expect(json["services"].map { |item| item["name"] }).to eq([ "Limpeza" ])
      expect(json["tags"].map { |item| item["id"] }).to eq([ tag.id.to_s ])
      expect(json["teams"]).to eq([ { "id" => team.id, "name" => "Atendimento" } ])
    end
  end
end
