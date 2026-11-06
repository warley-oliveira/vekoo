require "rails_helper"

RSpec.describe "Agenda: turmas", type: :request do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, name: "Marina Duarte") }
  let(:headers) { auth_headers(account) }
  let(:calendar) { create(:agenda_calendar, :class_group, organization: organization, time_zone: "America/Sao_Paulo") }
  let(:group) { create(:agenda_class_group, calendar: calendar, name: "Pilates", max_students: 2) }
  let(:foreign_calendar) { create(:agenda_calendar, :class_group) }
  let(:foreign_group) { create(:agenda_class_group, calendar: foreign_calendar) }
  let(:chat) { create(:chat, organization_id: organization.id, user_name: "Maria") }
  # Segunda-feira, às 08:00: o horário que está na grade da factory.
  let(:virtual_id) { "vcs_#{group.id}_20300107_0800" }

  before { travel_to(Time.utc(2030, 1, 1, 12, 0)) }
  after { travel_back }

  describe "sessão e permissão" do
    [
      [ :get, "/calendars/x/class-groups" ],
      [ :post, "/calendars/x/class-groups" ],
      [ :get, "/calendars/x/class-groups/x" ],
      [ :patch, "/calendars/x/class-groups/x" ],
      [ :delete, "/calendars/x/class-groups/x" ],
      [ :get, "/calendars/x/class-groups/x/sessions" ],
      [ :post, "/calendars/x/class-groups/x/sessions" ],
      [ :get, "/calendars/x/class-groups/x/sessions/x" ],
      [ :patch, "/calendars/x/class-groups/x/sessions/x" ],
      [ :post, "/calendars/x/class-groups/x/sessions/x/cancel" ],
      [ :get, "/calendars/x/class-groups/x/enrollments" ],
      [ :post, "/calendars/x/class-groups/x/enrollments" ],
      [ :delete, "/calendars/x/class-groups/x/enrollments/x" ],
      [ :get, "/class-sessions/x/attendances" ],
      [ :post, "/class-sessions/x/attendances" ],
      [ :put, "/class-sessions/x/attendances/x" ],
      [ :delete, "/class-sessions/x/attendances/x" ],
      [ :get, "/class-sessions/x/attendances/schedule" ],
      [ :post, "/class-sessions/x/attendances/bulk-update" ]
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

  describe "turmas" do
    let(:schedule) { [ { dayOfWeek: 2, enabled: true, windows: [ { start: "19:00", end: "20:00" } ] } ] }

    describe "GET" do
      it "lista as do calendário, com a contagem de inscritos numa consulta só" do
        create(:agenda_class_enrollment, class_group: group)
        create(:agenda_class_group, calendar: foreign_calendar)

        get "/calendars/#{calendar.id}/class-groups", headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(json["classGroups"].sole).to include("id" => group.id.to_s, "name" => "Pilates", "activeEnrollmentCount" => 1, "maxStudents" => 2, "recurrenceType" => "weekly")
        expect(json["classGroups"].sole["schedule"].first).to include("dayOfWeek" => 1, "enabled" => true)
      end

      it "filtra as ativas e as visíveis" do
        group
        create(:agenda_class_group, calendar: calendar, active: false)
        create(:agenda_class_group, calendar: calendar, visible: false)

        get "/calendars/#{calendar.id}/class-groups", params: { active: "true", visible: "true" }, headers: headers

        expect(json["classGroups"].map { |item| item["id"] }).to eq([ group.id.to_s ])
      end

      it "as datas saem como dia, sem virar instante" do
        group.update!(start_date: Date.new(2030, 1, 7), end_date: Date.new(2030, 6, 30))

        get "/calendars/#{calendar.id}/class-groups/#{group.id}", headers: headers, as: :json

        expect(json).to include("startDate" => "2030-01-07", "endDate" => "2030-06-30")
      end

      it "de outra organização é 404, que a origem deixava passar pelo id" do
        get "/calendars/#{foreign_calendar.id}/class-groups", headers: headers, as: :json
        expect(response).to have_http_status(:not_found)

        get "/calendars/#{calendar.id}/class-groups/#{foreign_group.id}", headers: headers, as: :json
        expect(response).to have_http_status(:not_found)
      end
    end

    describe "POST" do
      it "cria, com a grade em camelCase" do
        post "/calendars/#{calendar.id}/class-groups", params: { classGroup: {
          name: "Yoga", maxStudents: 12, minStudents: 2, defaultDurationMinutes: 50, startDate: "2030-02-01", endDate: "2030-06-30",
          recurrenceType: "biweekly", recurrenceEndType: "occurrences", recurrenceOccurrences: 10, tags: %w[manhã], priceCents: 9900,
          location: "Unidade Savassi", room: "Sala 2", instructorName: "Bia", schedule: schedule
        } }, headers: headers, as: :json

        expect(response).to have_http_status(:created)
        expect(json).to include("name" => "Yoga", "maxStudents" => 12, "recurrenceType" => "biweekly", "tags" => %w[manhã], "priceCents" => 9900, "activeEnrollmentCount" => 0)
        expect(json["schedule"]).to eq([ { "dayOfWeek" => 2, "enabled" => true, "windows" => [ { "start" => "19:00", "end" => "20:00" } ] } ])
        expect(Agenda::ClassGroup.find(json["id"]).organization_id).to eq(organization.id.to_s)
      end

      {
        "sem nome" => [ { name: "" }, "name" ],
        "com mínimo acima do máximo" => [ { name: "A", minStudents: 5, maxStudents: 2 }, "minStudents" ],
        "com fim antes do início" => [ { name: "A", startDate: "2030-02-01", endDate: "2030-01-01" }, "endDate" ],
        "com repetição desconhecida" => [ { name: "A", recurrenceType: "anual" }, "recurrenceType" ],
        "com janela invertida" => [ { name: "A", schedule: [ { dayOfWeek: 1, enabled: true, windows: [ { start: "20:00", end: "19:00" } ] } ] }, "schedule" ],
        "com instrutor de outra organização" => [ { name: "A", instructorAccountId: "00000000-0000-0000-0000-000000000000" }, "instructorAccountId" ]
      }.each do |description, (attributes, field)|
        it "recusa turma #{description}" do
          post "/calendars/#{calendar.id}/class-groups", params: { classGroup: attributes }, headers: headers, as: :json

          expect(response).to have_http_status(:unprocessable_entity)
          expect(json["error"]["field"]).to eq(field)
        end
      end
    end

    describe "PATCH" do
      it "mudar a grade leva as aulas futuras e as inscrições junto" do
        start_at = calendar.zone.local(2030, 1, 7, 8, 0)
        session = create(:agenda_class_session, class_group: group, start: start_at, end: start_at + 1.hour)
        enrollment = create(:agenda_class_enrollment, class_group: group, schedule_day_of_week: 1, schedule_window_start: "08:00")

        patch "/calendars/#{calendar.id}/class-groups/#{group.id}", params: { classGroup: { schedule: [ { dayOfWeek: 1, enabled: true, windows: [ { start: "10:00", end: "11:00" } ] } ] } }, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(session.reload.start).to eq(calendar.zone.local(2030, 1, 7, 10, 0))
        expect(enrollment.reload.schedule_window_start).to eq("10:00")
      end

      it "de outra organização é 404" do
        patch "/calendars/#{calendar.id}/class-groups/#{foreign_group.id}", params: { classGroup: { name: "Invadida" } }, headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
        expect(foreign_group.reload.name).not_to eq("Invadida")
      end
    end

    describe "DELETE" do
      it "apaga, com as inscrições e as exceções" do
        enrollment = create(:agenda_class_enrollment, class_group: group)
        session = create(:agenda_class_session, class_group: group)

        delete "/calendars/#{calendar.id}/class-groups/#{group.id}", headers: headers, as: :json

        expect(response).to have_http_status(:no_content)
        expect(Agenda::ClassEnrollment.where(id: enrollment.id)).not_to exist
        expect(Agenda::ClassSession.where(id: session.id)).not_to exist
      end
    end
  end

  describe "aulas" do
    let(:base) { "/calendars/#{calendar.id}/class-groups/#{group.id}/sessions" }

    describe "GET" do
      it "lista só as exceções gravadas, sem as canceladas por padrão" do
        active = create(:agenda_class_session, class_group: group)
        canceled = create(:agenda_class_session, class_group: group, status: "canceled")

        get base, headers: headers, as: :json
        expect(json["sessions"].map { |item| item["id"] }).to eq([ active.id.to_s ])

        get base, params: { includeCanceled: "true" }, headers: headers
        expect(json["sessions"].map { |item| item["id"] }).to contain_exactly(active.id.to_s, canceled.id.to_s)
      end

      it "filtra por período" do
        inside = create(:agenda_class_session, class_group: group, start: Time.utc(2030, 1, 10, 12), end: Time.utc(2030, 1, 10, 13))
        create(:agenda_class_session, class_group: group, start: Time.utc(2030, 2, 10, 12), end: Time.utc(2030, 2, 10, 13))

        get base, params: { start: "2030-01-01", end: "2030-01-31" }, headers: headers

        expect(json["sessions"].map { |item| item["id"] }).to eq([ inside.id.to_s ])
      end

      it "turma de outra organização é 404, mesmo por um calendário meu" do
        get "/calendars/#{calendar.id}/class-groups/#{foreign_group.id}/sessions", headers: headers, as: :json
        expect(response).to have_http_status(:not_found)

        get "/calendars/#{foreign_calendar.id}/class-groups/#{foreign_group.id}/sessions", headers: headers, as: :json
        expect(response).to have_http_status(:not_found)
      end
    end

    describe "GET :id" do
      it "aula calculada: mostra com os inscritos pendentes, com o fim da janela" do
        enrollment = create(:agenda_class_enrollment, class_group: group, chat: chat)

        get "#{base}/#{virtual_id}", headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(json).to include("id" => virtual_id, "virtual" => true, "title" => "Pilates", "scheduleDayOfWeek" => 1, "scheduleWindowStart" => "08:00", "enrollmentCount" => 1)
        expect(json["start"]).to eq(Time.utc(2030, 1, 7, 11, 0).to_i * 1000)
        expect(json["end"]).to eq(Time.utc(2030, 1, 7, 12, 0).to_i * 1000)
        expect(json["attendances"].sole).to include("id" => "ve_#{enrollment.id}", "attendanceStatus" => nil, "userName" => "Maria", "chatId" => chat.id.to_s)
      end

      it "exceção gravada: mostra com as presenças e os pendentes" do
        marked = create(:agenda_class_enrollment, class_group: group, chat: chat)
        pending = create(:agenda_class_enrollment, class_group: group)
        start_at = calendar.zone.local(2030, 1, 7, 8, 0)
        session = create(:agenda_class_session, class_group: group, start: start_at, end: start_at + 1.hour)
        create(:agenda_class_attendance, class_session: session, class_enrollment: marked, chat: chat, attendance_status: "show", guest: false)

        get "#{base}/#{session.id}", headers: headers, as: :json

        expect(json).to include("virtual" => false)
        expect(json["attendances"].map { |item| item["id"] }).to include("ve_#{pending.id}")
        expect(json["attendances"].find { |item| item["chatId"] == chat.id.to_s }).to include("attendanceStatus" => "show")
        expect(json["attendanceSummary"]).to eq("total" => 1, "show" => 1, "noShow" => 0, "pending" => 0)
      end

      {
        "fora da grade" => ->(g) { "vcs_#{g.id}_20300107_0300" },
        "com data que não existe" => ->(g) { "vcs_#{g.id}_20301332_0800" },
        "quebrado" => ->(_g) { "vcs_quebrado" }
      }.each do |description, id|
        it "id #{description} é 404" do
          get "#{base}/#{id.call(group)}", headers: headers, as: :json

          expect(response).to have_http_status(:not_found)
        end
      end

      it "aula calculada de outra organização é 404" do
        get "#{base}/vcs_#{foreign_group.id}_20300107_0800", headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
      end
    end

    describe "POST" do
      it "cria aula avulsa, na hora de parede do calendário" do
        post base, params: { classSession: { start: "2030-01-09 18:00", end: "2030-01-09 19:00", title: "Aula extra", notes: "Reposição" } }, headers: headers, as: :json

        expect(response).to have_http_status(:created)
        expect(json).to include("title" => "Aula extra", "notes" => "Reposição", "virtual" => false, "classGroupId" => group.id.to_s, "scheduleWindowStart" => "18:00", "scheduleDayOfWeek" => 3)
        expect(json["start"]).to eq(Time.utc(2030, 1, 9, 21, 0).to_i * 1000)
      end

      it "sem horário é 422" do
        post base, params: { classSession: { title: "Sem" } }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json["error"]["field"]).to eq("start")
      end

      it "fim antes do início é 422" do
        post base, params: { classSession: { start: "2030-01-09 18:00", end: "2030-01-09 17:00" } }, headers: headers, as: :json

        expect(json["error"]["field"]).to eq("end")
      end
    end

    describe "PATCH :id" do
      it "aula calculada: materializa, com o fim da janela, e grava a mudança" do
        expect {
          patch "#{base}/#{virtual_id}", params: { classSession: { notes: "Trazer tapete" } }, headers: headers, as: :json
        }.to change { Agenda::ClassSession.count }.by(1)

        expect(response).to have_http_status(:ok)
        session = Agenda::ClassSession.find(json["id"])
        expect(session).to have_attributes(notes: "Trazer tapete", start: calendar.zone.local(2030, 1, 7, 8, 0), end: calendar.zone.local(2030, 1, 7, 9, 0))
      end

      it "a segunda mudança na mesma aula não cria outra" do
        patch "#{base}/#{virtual_id}", params: { classSession: { notes: "1" } }, headers: headers, as: :json

        expect {
          patch "#{base}/#{virtual_id}", params: { classSession: { notes: "2" } }, headers: headers, as: :json
        }.not_to(change { Agenda::ClassSession.count })
      end

      it "transmite ao calendário" do
        expect {
          patch "#{base}/#{virtual_id}", params: { classSession: { notes: "1" } }, headers: headers, as: :json
        }.to have_broadcasted_to(AgendaChannel.organization_stream(organization.id, "agenda")).at_least(:once).with(hash_including(type: "class_session"))
      end
    end

    describe "POST :id/cancel" do
      it "aula calculada: materializa cancelada, e o calendário mostra a cancelada" do
        post "#{base}/#{virtual_id}/cancel", headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(json).to include("status" => "canceled", "virtual" => false)

        get "/calendar-events", params: { start: "2030-01-07", end: "2030-01-07 23:59" }, headers: headers
        expect(json["events"].sole).to include("status" => "canceled", "virtual" => false)
      end
    end
  end

  describe "inscrições" do
    let(:base) { "/calendars/#{calendar.id}/class-groups/#{group.id}/enrollments" }

    describe "GET" do
      it "lista as ativas, com a lotação" do
        active = create(:agenda_class_enrollment, class_group: group, chat: chat)
        create(:agenda_class_enrollment, class_group: group, status: "canceled")

        get base, headers: headers, as: :json

        expect(json["enrollments"].sole).to include("id" => active.id.to_s, "userName" => "Maria", "status" => "active", "chatId" => chat.id.to_s)
        expect(json).to include("activeCount" => 1, "maxStudents" => 2)
      end

      it "com as canceladas, quando pedir" do
        create(:agenda_class_enrollment, class_group: group, status: "canceled")

        get base, params: { includeCanceled: "true" }, headers: headers

        expect(json["enrollments"].size).to eq(1)
      end
    end

    describe "POST" do
      it "inscreve" do
        post base, params: { chatId: chat.id.to_s }, headers: headers, as: :json

        expect(response).to have_http_status(:created)
        expect(json).to include("chatId" => chat.id.to_s, "status" => "active", "userName" => "Maria")
      end

      it "conversa de outra organização é 404, que a origem deixava passar" do
        other = create(:chat, organization_id: create(:organization).id)

        post base, params: { chatId: other.id.to_s }, headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
        expect(Agenda::ClassEnrollment.count).to eq(0)
      end

      it "turma cheia é 422" do
        2.times { create(:agenda_class_enrollment, class_group: group) }

        post base, params: { chatId: chat.id.to_s }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json.dig("error", "code")).to eq("classGroupFull")
      end

      it "já inscrito é 422" do
        create(:agenda_class_enrollment, class_group: group, chat: chat)

        post base, params: { chatId: chat.id.to_s }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json["error"]["field"]).to eq("chatId")
      end

      it "quem cancelou pode se inscrever de novo, que a origem recusava" do
        create(:agenda_class_enrollment, class_group: group, chat: chat, status: "canceled")

        post base, params: { chatId: chat.id.to_s }, headers: headers, as: :json

        expect(response).to have_http_status(:created)
      end

      it "sem conversa é 400" do
        post base, headers: headers, as: :json

        expect(response).to have_http_status(:bad_request)
      end
    end

    describe "DELETE" do
      it "cancela todas as inscrições do contato nesta turma, e transmite" do
        first = create(:agenda_class_enrollment, class_group: group, chat: chat, schedule_day_of_week: 1, schedule_window_start: "08:00")
        second = create(:agenda_class_enrollment, class_group: group, chat: chat, schedule_day_of_week: 3, schedule_window_start: "08:00")

        expect {
          delete "#{base}/#{first.id}", headers: headers, as: :json
        }.to have_broadcasted_to(AgendaChannel.organization_stream(organization.id, "agenda")).exactly(2).times.with(hash_including(action: "enrollment_update"))

        expect(response).to have_http_status(:no_content)
        expect(first.reload.status).to eq("canceled")
        expect(second.reload.status).to eq("canceled")
      end

      it "inscrição de outra turma é 404" do
        other = create(:agenda_class_enrollment, class_group: create(:agenda_class_group, calendar: calendar))

        delete "#{base}/#{other.id}", headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
      end
    end
  end

  describe "presenças" do
    let(:base) { "/class-sessions/#{virtual_id}/attendances" }
    let!(:enrollment) { create(:agenda_class_enrollment, class_group: group, chat: chat) }

    describe "GET" do
      it "aula calculada: os inscritos como pendentes" do
        get base, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(json["attendances"].sole).to include("id" => "ve_#{enrollment.id}", "classEnrollmentId" => enrollment.id.to_s, "attendanceStatus" => nil, "guest" => false, "userName" => "Maria")
      end

      it "aula de outra organização é 404" do
        get "/class-sessions/vcs_#{foreign_group.id}_20300107_0800/attendances", headers: headers, as: :json
        expect(response).to have_http_status(:not_found)

        session = create(:agenda_class_session, class_group: foreign_group)
        get "/class-sessions/#{session.id}/attendances", headers: headers, as: :json
        expect(response).to have_http_status(:not_found)
      end
    end

    describe "PUT :id" do
      it "marcar um pendente materializa a aula e cria a presença, com quem marcou" do
        expect {
          put "#{base}/ve_#{enrollment.id}", params: { attendanceStatus: "show" }, headers: headers, as: :json
        }.to change { Agenda::ClassSession.count }.by(1).and change { Agenda::ClassAttendance.count }.by(1)

        expect(response).to have_http_status(:ok)
        expect(json).to include("attendanceStatus" => "show", "checkedBy" => "Marina Duarte", "chatId" => chat.id.to_s, "guest" => false)
        expect(json["checkedAt"]).to be_a(Integer)
      end

      it "marcar de novo pelo id atualiza, sem duplicar" do
        put "#{base}/ve_#{enrollment.id}", params: { attendanceStatus: "show" }, headers: headers, as: :json
        id = json["id"]

        expect {
          put "#{base}/#{id}", params: { attendanceStatus: "no_show" }, headers: headers, as: :json
        }.not_to(change { Agenda::ClassAttendance.count })

        expect(json["attendanceStatus"]).to eq("no_show")
      end

      it "transmite o resumo da aula" do
        expect {
          put "#{base}/ve_#{enrollment.id}", params: { attendanceStatus: "show" }, headers: headers, as: :json
        }.to have_broadcasted_to(AgendaChannel.organization_stream(organization.id, "agenda")).with(hash_including(
          action: "attendance_update", classGroupId: group.id.to_s, scheduleDayOfWeek: 1, scheduleWindowStart: "08:00",
          attendanceSummary: { total: 1, show: 1, noShow: 0, pending: 0 }
        ))
      end

      it "situação que não existe é 422" do
        put "#{base}/ve_#{enrollment.id}", params: { attendanceStatus: "talvez" }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json["error"]["field"]).to eq("attendanceStatus")
      end

      it "inscrição de outra turma é 404" do
        other = create(:agenda_class_enrollment, class_group: create(:agenda_class_group, calendar: calendar))

        put "#{base}/ve_#{other.id}", params: { attendanceStatus: "show" }, headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
      end
    end

    describe "POST" do
      let(:guest_chat) { create(:chat, organization_id: organization.id, user_name: "João") }

      it "sem inscrever: entra como convidado só nesta aula" do
        post base, params: { chatId: guest_chat.id.to_s }, headers: headers, as: :json

        expect(response).to have_http_status(:created)
        expect(json).to include("guest" => true, "attendanceStatus" => nil, "userName" => "João")
        expect(Agenda::ClassEnrollment.where(chat_id: guest_chat.id)).not_to exist
      end

      it "convidado repetido é 422" do
        post base, params: { chatId: guest_chat.id.to_s }, headers: headers, as: :json
        post base, params: { chatId: guest_chat.id.to_s }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json.dig("error", "code")).to eq("alreadyInSession")
      end

      it "inscrevendo, sem horários: no horário desta aula" do
        post base, params: { chatId: guest_chat.id.to_s, enrollAll: true }, headers: headers, as: :json

        expect(response).to have_http_status(:created)
        expect(json).to eq("enrolledAll" => true, "enrollmentsCreated" => 1)
        expect(Agenda::ClassEnrollment.where(chat_id: guest_chat.id).take).to have_attributes(schedule_day_of_week: 1, schedule_window_start: "08:00", status: "active")
      end

      it "inscrevendo, com horários: em cada um, e transmite" do
        expect {
          post base, params: { chatId: guest_chat.id.to_s, enrollAll: true, slots: [ { dayOfWeek: 1, windowStart: "08:00" }, { dayOfWeek: 3, windowStart: "08:00" } ] }, headers: headers, as: :json
        }.to have_broadcasted_to(AgendaChannel.organization_stream(organization.id, "agenda")).exactly(2).times

        expect(json["enrollmentsCreated"]).to eq(2)
      end

      it "horário fora da grade é 422" do
        post base, params: { chatId: guest_chat.id.to_s, enrollAll: true, slots: [ { dayOfWeek: 2, windowStart: "03:00" } ] }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json.dig("error", "code")).to eq("invalidSlot")
      end

      it "reativa a inscrição cancelada, sem criar outra" do
        canceled = create(:agenda_class_enrollment, class_group: group, chat: guest_chat, status: "canceled", schedule_day_of_week: 1, schedule_window_start: "08:00")

        post base, params: { chatId: guest_chat.id.to_s, enrollAll: true }, headers: headers, as: :json

        expect(canceled.reload.status).to eq("active")
        expect(Agenda::ClassEnrollment.where(chat_id: guest_chat.id).count).to eq(1)
      end

      it "já inscrito não conta como criado" do
        create(:agenda_class_enrollment, class_group: group, chat: guest_chat, schedule_day_of_week: 1, schedule_window_start: "08:00")

        post base, params: { chatId: guest_chat.id.to_s, enrollAll: true }, headers: headers, as: :json

        expect(json["enrollmentsCreated"]).to eq(0)
      end

      it "conversa de outra organização é 404" do
        other = create(:chat, organization_id: create(:organization).id)

        post base, params: { chatId: other.id.to_s }, headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
      end
    end

    describe "DELETE :id" do
      it "tira o convidado" do
        post base, params: { chatId: create(:chat, organization_id: organization.id).id.to_s }, headers: headers, as: :json
        id = json["id"]

        delete "#{base}/#{id}", headers: headers, as: :json

        expect(response).to have_http_status(:no_content)
        expect(Agenda::ClassAttendance.where(id: id)).not_to exist
      end

      it "em aula sem documento, ou de outra aula, é 404" do
        delete "#{base}/qualquer", headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
      end
    end

    describe "GET schedule" do
      it "lista as janelas, marcando a da aula" do
        get "#{base}/schedule", headers: headers, as: :json

        expect(json["windows"]).to eq([
          { "dayOfWeek" => 1, "windowStart" => "08:00", "windowEnd" => "09:00", "current" => true },
          { "dayOfWeek" => 3, "windowStart" => "08:00", "windowEnd" => "09:00", "current" => false }
        ])
      end
    end

    describe "POST bulk-update" do
      it "marca todos do horário de uma vez" do
        other = create(:agenda_class_enrollment, class_group: group)

        post "#{base}/bulk-update", params: { attendanceStatus: "show" }, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(json["attendanceSummary"]).to eq("total" => 2, "show" => 2, "noShow" => 0, "pending" => 0)
        expect(Agenda::ClassAttendance.where(chat_id: other.chat_id).take.checked_by).to eq("Marina Duarte")
      end

      it "nulo desmarca todos" do
        post "#{base}/bulk-update", params: { attendanceStatus: "show" }, headers: headers, as: :json
        post "#{base}/bulk-update", params: { attendanceStatus: nil }, headers: headers, as: :json

        expect(json["attendanceSummary"]).to include("show" => 0, "pending" => 1)
      end

      it "situação que não existe é 422, e não materializa nada" do
        expect {
          post "#{base}/bulk-update", params: { attendanceStatus: "talvez" }, headers: headers, as: :json
        }.not_to(change { Agenda::ClassSession.count })

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json.dig("error", "code")).to eq("invalidAttendanceStatus")
      end
    end
  end
end
