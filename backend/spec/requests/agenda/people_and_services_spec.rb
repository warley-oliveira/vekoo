require "rails_helper"

RSpec.describe "Agenda: profissionais e serviços", type: :request do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:headers) { auth_headers(account) }
  let(:calendar) { create(:agenda_calendar, organization: organization) }
  let(:foreign_calendar) { create(:agenda_calendar) }

  describe "sessão e permissão" do
    %w[professionals services].each do |resource|
      [
        [ :get, "/#{resource}" ],
        [ :get, "/calendars/qualquer/#{resource}" ],
        [ :post, "/calendars/qualquer/#{resource}" ],
        [ :get, "/calendars/qualquer/#{resource}/qualquer" ],
        [ :patch, "/calendars/qualquer/#{resource}/qualquer" ],
        [ :delete, "/calendars/qualquer/#{resource}/qualquer" ]
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
  end

  describe "profissionais" do
    let(:days) do
      [
        { dayOfWeek: 1, enabled: true, windows: [ { start: "09:00", end: "12:00" }, { start: "14:00", end: "18:00" } ] },
        { dayOfWeek: 2, enabled: false, windows: [] }
      ]
    end

    describe "GET" do
      it "lista os do calendário, com os horários, em ordem de nome" do
        create(:agenda_professional, :with_rule, calendar: calendar, name: "Bia")
        ana = create(:agenda_professional, :with_rule, calendar: calendar, name: "Ana")
        create(:agenda_professional, calendar: create(:agenda_calendar, organization: organization), name: "De outro")

        get "/calendars/#{calendar.id}/professionals", headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(json["professionals"].map { |item| item["name"] }).to eq(%w[Ana Bia])
        expect(json["professionals"].first).to include("id" => ana.id.to_s, "calendarId" => calendar.id.to_s, "avatarUrl" => nil)
        expect(json["professionals"].first.dig("rule", "days").first).to eq("dayOfWeek" => 0, "enabled" => false, "windows" => [])
        expect(json["meta"]).to include("total" => 2)
      end

      it "calendário de outra organização é 404" do
        get "/calendars/#{foreign_calendar.id}/professionals", headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
      end

      it "GET /professionals traz os de todos os calendários da organização, sem os de outra" do
        mine = create(:agenda_professional, calendar: calendar)
        create(:agenda_professional, calendar: foreign_calendar)

        get "/professionals", headers: headers, as: :json

        expect(json["professionals"].map { |item| item["id"] }).to eq([ mine.id.to_s ])
      end

      it "um só" do
        professional = create(:agenda_professional, :with_rule, calendar: calendar)

        get "/calendars/#{calendar.id}/professionals/#{professional.id}", headers: headers, as: :json

        expect(json["id"]).to eq(professional.id.to_s)
      end

      it "profissional de outro calendário é 404" do
        other = create(:agenda_professional, calendar: create(:agenda_calendar, organization: organization))

        get "/calendars/#{calendar.id}/professionals/#{other.id}", headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
      end
    end

    describe "POST" do
      def create_professional(**attributes)
        post "/calendars/#{calendar.id}/professionals", params: { professional: { name: "Dra. Ana", phone: "(31) 98379-4137" }.merge(attributes) }, headers: headers, as: :json
      end

      it "cria com os horários mandados, na forma canônica" do
        create_professional(email: "ana@exemplo.com.br", color: "#112233", externalId: "ERP-1", rule: { days: days, blockedTimes: [ { start: "2030-01-14 13:00", end: "2030-01-14 15:00" } ] })

        expect(response).to have_http_status(:created)
        expect(json).to include("name" => "Dra. Ana", "phone" => "5531983794137", "email" => "ana@exemplo.com.br", "color" => "#112233", "externalId" => "ERP-1")
        expect(json.dig("rule", "days").first).to eq("dayOfWeek" => 1, "enabled" => true, "windows" => [ { "start" => "09:00", "end" => "12:00" }, { "start" => "14:00", "end" => "18:00" } ])
        expect(json.dig("rule", "blockedTimes")).to eq([ { "start" => "2030-01-14 13:00", "end" => "2030-01-14 15:00" } ])
        expect(Agenda::Professional.find(json["id"]).organization_id).to eq(organization.id.to_s)
      end

      it "sem horários, fica com o padrão: todo profissional tem regra" do
        create_professional

        expect(json.dig("rule", "days").find { |day| day["dayOfWeek"] == 1 }["windows"]).to eq([ { "start" => "09:00", "end" => "17:00" } ])
      end

      it "ligado a uma conta, usa o nome e o e-mail dela" do
        create_professional(accountId: account.id, name: "Outro")

        expect(json).to include("accountId" => account.id, "name" => account.name, "email" => account.email)
      end

      it "conta de outra organização é 422" do
        create_professional(accountId: create(:account).id)

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json["error"]["field"]).to eq("accountId")
      end

      it "sem nome é 422, e nada fica gravado" do
        expect { create_professional(name: "") }.not_to(change { Agenda::Rule.count })

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json["error"]["field"]).to eq("name")
      end

      it "horário inválido é 422, sem sobrar profissional sem regra" do
        expect {
          create_professional(rule: { days: [ { dayOfWeek: 1, enabled: true, windows: [ { start: "18:00", end: "09:00" } ] } ] })
        }.not_to(change { Agenda::Professional.count })

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json["error"]["field"]).to eq("days")
      end

      it "a organização do corpo é ignorada, e o calendário é o da rota" do
        create_professional(organizationId: "outra", calendarId: foreign_calendar.id.to_s)

        expect(Agenda::Professional.find(json["id"])).to have_attributes(organization_id: organization.id.to_s, calendar_id: calendar.id)
      end
    end

    describe "PATCH" do
      let!(:professional) { create(:agenda_professional, :with_rule, calendar: calendar, name: "Ana") }

      it "muda os dados e os horários" do
        patch "/calendars/#{calendar.id}/professionals/#{professional.id}", params: { professional: { name: "Ana Paula", rule: { days: days } } }, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(json["name"]).to eq("Ana Paula")
        expect(json.dig("rule", "days").size).to eq(2)
        expect(Agenda::Rule.where(professional_id: professional.id).count).to eq(1)
      end

      it "sem mandar os horários, deixa como estão" do
        patch "/calendars/#{calendar.id}/professionals/#{professional.id}", params: { professional: { name: "Ana Paula" } }, headers: headers, as: :json

        expect(json.dig("rule", "days").size).to eq(7)
      end

      it "horário inválido é 422, e nada muda" do
        patch "/calendars/#{calendar.id}/professionals/#{professional.id}", params: { professional: { name: "Outra", rule: { days: [ { dayOfWeek: 1, enabled: true, windows: [] } ] } } }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_entity)
        expect(professional.reload.name).to eq("Ana")
      end

      it "de outro calendário é 404" do
        other = create(:agenda_professional, calendar: foreign_calendar)

        patch "/calendars/#{calendar.id}/professionals/#{other.id}", params: { professional: { name: "Invadido" } }, headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
        expect(other.reload.name).not_to eq("Invadido")
      end
    end

    describe "DELETE" do
      it "apaga, deixando os agendamentos" do
        professional = create(:agenda_professional, :with_rule, calendar: calendar)
        booking = create(:agenda_booking, calendar: calendar, professional: professional)

        delete "/calendars/#{calendar.id}/professionals/#{professional.id}", headers: headers, as: :json

        expect(response).to have_http_status(:no_content)
        expect(booking.reload.professional_id).to be_nil
      end

      it "de outra organização é 404" do
        other = create(:agenda_professional, calendar: foreign_calendar)

        delete "/calendars/#{foreign_calendar.id}/professionals/#{other.id}", headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
        expect(Agenda::Professional.where(id: other.id)).to exist
      end
    end
  end

  describe "serviços" do
    let(:professional) { create(:agenda_professional, calendar: calendar) }

    describe "GET" do
      it "lista os do calendário" do
        service = create(:agenda_offering, calendar: calendar, name: "Limpeza", duration: 45, professionals: [ professional ])
        create(:agenda_offering, calendar: foreign_calendar)

        get "/calendars/#{calendar.id}/services", headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(json["services"].sole).to include(
          "id" => service.id.to_s, "name" => "Limpeza", "duration" => 45, "timeIncrementInterval" => 15,
          "guestLimit" => 1, "distribution" => { professional.id.to_s => 100 }
        )
      end

      it "GET /services traz os da organização" do
        mine = create(:agenda_offering, calendar: calendar, professionals: [ professional ])
        create(:agenda_offering, calendar: foreign_calendar)

        get "/services", headers: headers, as: :json

        expect(json["services"].map { |item| item["id"] }).to eq([ mine.id.to_s ])
      end

      it "de outra organização é 404" do
        get "/calendars/#{foreign_calendar.id}/services", headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
      end
    end

    describe "POST" do
      def create_service(**attributes)
        post "/calendars/#{calendar.id}/services", params: { service: { name: "Limpeza", duration: 45, distribution: { professional.id.to_s => 100 } }.merge(attributes) }, headers: headers, as: :json
      end

      it "cria, e liga o profissional" do
        create_service(bufferBefore: 5, bufferAfter: 10, timeIncrementInterval: 30, guestLimit: 2, description: "Com flúor", successMessage: "Chegue antes", externalId: "ERP")

        expect(response).to have_http_status(:created)
        expect(json).to include("bufferBefore" => 5, "bufferAfter" => 10, "timeIncrementInterval" => 30, "guestLimit" => 2, "description" => "Com flúor", "successMessage" => "Chegue antes", "externalId" => "ERP")
        expect(professional.reload.service_ids.map(&:to_s)).to include(json["id"])
      end

      it "o id do profissional passa intacto, sem virar outra coisa no camelCase" do
        create_service

        expect(json["distribution"]).to eq(professional.id.to_s => 100)
      end

      it "distribuição que não soma 100 é 422" do
        create_service(distribution: { professional.id.to_s => 50 })

        expect(response).to have_http_status(:unprocessable_entity)
        expect(json["error"]["field"]).to eq("distribution")
      end

      it "profissional de outra organização na distribuição é 422, e não vira ligação" do
        other = create(:agenda_professional, calendar: foreign_calendar)

        create_service(distribution: { other.id.to_s => 100 })

        expect(response).to have_http_status(:unprocessable_entity)
        expect(other.reload.service_ids).to be_empty
      end

      it "sem duração, ou com intervalo zero, é 422" do
        create_service(duration: nil)
        expect(json["error"]["field"]).to eq("duration")

        create_service(timeIncrementInterval: 0)
        expect(json["error"]["field"]).to eq("timeIncrementInterval")
      end
    end

    describe "PATCH" do
      let!(:service) { create(:agenda_offering, calendar: calendar, professionals: [ professional ]) }

      it "muda, e desliga quem ficou com zero" do
        other = create(:agenda_professional, calendar: calendar)

        patch "/calendars/#{calendar.id}/services/#{service.id}", params: { service: { name: "Novo", distribution: { professional.id.to_s => 0, other.id.to_s => 100 } } }, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(json["name"]).to eq("Novo")
        expect(professional.reload.service_ids).not_to include(service.id)
        expect(other.reload.service_ids).to include(service.id)
      end

      it "de outro calendário é 404" do
        other = create(:agenda_offering, calendar: foreign_calendar)

        patch "/calendars/#{calendar.id}/services/#{other.id}", params: { service: { name: "Invadido" } }, headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
      end
    end

    describe "DELETE" do
      it "apaga, deixando os agendamentos" do
        service = create(:agenda_offering, calendar: calendar, professionals: [ professional ])
        booking = create(:agenda_booking, calendar: calendar, service: service)

        delete "/calendars/#{calendar.id}/services/#{service.id}", headers: headers, as: :json

        expect(response).to have_http_status(:no_content)
        expect(booking.reload.service_id).to be_nil
      end
    end
  end
end
