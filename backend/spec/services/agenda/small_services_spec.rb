require "rails_helper"

RSpec.describe "Serviços pequenos da agenda" do
  describe Agenda::TimeInput do
    let(:zone) { ActiveSupport::TimeZone["America/Sao_Paulo"] }

    describe ".parse" do
      it "vazio é nil" do
        expect(described_class.parse(nil, zone)).to be_nil
        expect(described_class.parse("", zone)).to be_nil
      end

      it "aceita milissegundos, como a API devolve" do
        ms = (Time.utc(2030, 1, 14, 12, 0).to_f * 1000).to_i

        expect(described_class.parse(ms, zone)).to eq(Time.utc(2030, 1, 14, 12, 0))
        expect(described_class.parse(ms.to_s, zone)).to eq(Time.utc(2030, 1, 14, 12, 0))
      end

      it "com deslocamento, vale o instante" do
        expect(described_class.parse("2030-01-14T12:00:00Z", zone)).to eq(Time.utc(2030, 1, 14, 12, 0))
        expect(described_class.parse("2030-01-14T09:00:00-03:00", zone)).to eq(Time.utc(2030, 1, 14, 12, 0))
      end

      it "sem deslocamento, vale a hora de parede do fuso" do
        expect(described_class.parse("2030-01-14 09:00", zone)).to eq(Time.utc(2030, 1, 14, 12, 0))
        expect(described_class.parse("2030-01-14T09:00", ActiveSupport::TimeZone["Asia/Tokyo"])).to eq(Time.utc(2030, 1, 14, 0, 0))
      end

      it "só a data é o começo do dia no fuso" do
        expect(described_class.parse("2030-01-14", zone)).to eq(Time.utc(2030, 1, 14, 3, 0))
      end

      it "hora que não existe na virada do horário de verão avança, em vez de quebrar" do
        new_york = ActiveSupport::TimeZone["America/New_York"]

        expect(described_class.parse("2030-03-10 02:30", new_york).hour).to eq(3)
      end

      %w[ontem 2030-13-40 2030-02-30T10:00].each do |value|
        it "recusa #{value}" do
          expect { described_class.parse(value, zone) }.to raise_error(Agenda::TimeInput::Invalid)
        end
      end
    end

    describe ".local" do
      it "ignora o deslocamento e fica com a hora de parede" do
        expect(described_class.local("2030-01-14T10:00:00Z", zone)).to eq(Time.utc(2030, 1, 14, 13, 0))
        expect(described_class.local("2030-01-14T10:00:00+02:00", zone)).to eq(Time.utc(2030, 1, 14, 13, 0))
      end

      it "o que não dá para ler é nil" do
        expect(described_class.local("ontem", zone)).to be_nil
      end
    end
  end

  describe Agenda::CommercialTime do
    let(:zone) { ActiveSupport::TimeZone["America/Sao_Paulo"] }

    def at(hour, minute = 0)
      zone.local(2030, 1, 14, hour, minute)
    end

    it "dentro do horário, fica como está" do
      expect(described_class.next_after(at(10, 30), 9, 18)).to eq(at(10, 30))
    end

    it "antes de abrir, vai para a abertura" do
      expect(described_class.next_after(at(6), 9, 18)).to eq(at(9))
    end

    it "depois de fechar, vai para a abertura do dia seguinte" do
      expect(described_class.next_after(at(20), 9, 18)).to eq(at(9) + 1.day)
    end

    it "dia inteiro não muda nada" do
      expect(described_class.next_after(at(3), 9, 18, all_day: true)).to eq(at(3))
    end

    it "sem horário, usa 8 às 17, em vez de cair na meia-noite como a origem" do
      expect(described_class.next_after(at(20))).to eq(at(8) + 1.day)
      expect(described_class.next_after(at(10), nil, nil)).to eq(at(10))
    end

    it "fim às 24 é o fim do dia" do
      expect(described_class.next_after(at(23, 30), 9, 24)).to eq(at(23, 30))
    end

    it "continua no fuso de quem chamou" do
      expect(described_class.next_after(at(20), 9, 18).utc).to eq(Time.utc(2030, 1, 15, 12, 0))
    end
  end

  describe Agenda::SchedulerBalancer do
    it "reparte pela porcentagem" do
      balancer = described_class.new({ "a" => 70, "b" => 30 })

      counts = Array.new(100) { balancer.assign_client }.tally

      expect(counts["a"]).to be_between(68, 72)
      expect(counts["b"]).to be_between(28, 32)
    end

    it "escolhe quem está mais abaixo da sua parte" do
      expect(described_class.new({ "a" => 50, "b" => 50 }, nil, Hash.new(0).merge("a" => 3)).professional_to_assign).to eq("b")
    end

    it "sem distribuição, ninguém" do
      expect(described_class.new({}).professional_to_assign).to be_nil
    end
  end

  describe Agenda::BookingPlaceholders do
    let(:calendar) { create(:agenda_calendar, time_zone: "America/Sao_Paulo") }
    let(:professional) { create(:agenda_professional, calendar: calendar, name: "Dra. Ana") }
    let(:service) { create(:agenda_offering, calendar: calendar, name: "Limpeza", professionals: [ professional ]) }
    let(:chat) { create(:chat, organization_id: calendar.organization_id, user_name: "Maria", external_id: "5531971810932@s.whatsapp.net") }
    let(:booking) do
      create(:agenda_booking, calendar: calendar, chat: chat, professional: professional, service: service, title: "Consulta",
             google_meet_url: "https://meet.google.com/abc", skip_professional_notifications: true,
             start: Time.utc(2030, 1, 15, 1, 30), end: Time.utc(2030, 1, 15, 2, 30))
    end

    it "preenche todas as variáveis, no fuso do calendário" do
      text = "{{nome}}|{{user_name}}|{{telefone}}|{{servico}}|{{profissional}}|{{colaborador}}|{{titulo}}|{{data}}|{{hora}}|{{link_reuniao}}"

      expect(described_class.render(text, booking))
        .to eq("Maria|Maria|5531971810932|Limpeza|Dra. Ana|Dra. Ana|Consulta|14 de janeiro de 2030|22:30|https://meet.google.com/abc")
    end

    it "não toca no que não é variável" do
      expect(described_class.render("{{outra}} {nome}", booking)).to eq("{{outra}} {nome}")
    end

    it "sem conversa nem profissional, fica vazio em vez de quebrar" do
      empty = create(:agenda_booking, calendar: calendar, skip_professional_notifications: true)

      expect(described_class.render("[{{nome}}][{{profissional}}]", empty)).to eq("[][]")
      expect(described_class.render(nil, empty)).to eq("")
    end
  end

  describe Agenda::GoogleOauthState do
    let(:calendar) { create(:agenda_calendar) }
    let(:account) { create(:account) }

    it "vale para o mesmo calendário e a mesma pessoa, e deixa o id do calendário legível" do
      state = described_class.generate(calendar, account)

      expect(state).to start_with("#{calendar.id}.")
      expect(described_class.valid?(state, calendar, account)).to be(true)
    end

    it "não vale para outro calendário nem para outra pessoa" do
      state = described_class.generate(calendar, account)

      expect(described_class.valid?(state, create(:agenda_calendar), account)).to be(false)
      expect(described_class.valid?(state, calendar, create(:account))).to be(false)
    end

    it "não vale adulterado, em branco ou vencido" do
      state = described_class.generate(calendar, account)

      expect(described_class.valid?("#{state}x", calendar, account)).to be(false)
      expect(described_class.valid?(nil, calendar, account)).to be(false)
      expect(described_class.valid?(state, calendar, account, now: 16.minutes.from_now)).to be(false)
    end
  end

  describe Agenda::ClassGroupRescheduler do
    include ActiveSupport::Testing::TimeHelpers

    let(:calendar) { create(:agenda_calendar, :class_group, time_zone: "America/Sao_Paulo") }
    let(:old_schedule) { [ { "day_of_week" => 1, "enabled" => true, "windows" => [ { "start" => "08:00", "end" => "09:00" } ] } ] }
    let(:group) { create(:agenda_class_group, calendar: calendar, schedule: old_schedule) }

    around { |example| travel_to(Time.utc(2030, 1, 1, 12, 0)) { example.run } }

    def reschedule(start_at, finish = "11:00")
      group.update!(schedule: [ { "day_of_week" => 1, "enabled" => true, "windows" => [ { "start" => start_at, "end" => finish }.compact ] } ])
      described_class.new(group, old_schedule).call
    end

    it "move as aulas futuras no fuso do calendário, e deixa as passadas" do
      future = calendar.zone.local(2030, 1, 7, 8, 0)
      past = calendar.zone.local(2029, 12, 31, 8, 0)
      upcoming = create(:agenda_class_session, class_group: group, start: future, end: future + 1.hour)
      done = create(:agenda_class_session, class_group: group, start: past, end: past + 1.hour)

      reschedule("10:00")

      expect(upcoming.reload.start).to eq(calendar.zone.local(2030, 1, 7, 10, 0))
      expect(upcoming.end).to eq(calendar.zone.local(2030, 1, 7, 11, 0))
      expect(done.reload.start).to eq(past)
    end

    it "sem fim na janela nova, usa a duração padrão" do
      future = calendar.zone.local(2030, 1, 7, 8, 0)
      session = create(:agenda_class_session, class_group: group, start: future, end: future + 1.hour)

      reschedule("10:00", nil)

      expect(session.reload.end - session.start).to eq(60.minutes)
    end

    it "leva as inscrições do horário junto" do
      enrollment = create(:agenda_class_enrollment, class_group: group, schedule_day_of_week: 1, schedule_window_start: "08:00")

      reschedule("10:00")

      expect(enrollment.reload.schedule_window_start).to eq("10:00")
    end

    it "janela que sumiu não leva nada" do
      future = calendar.zone.local(2030, 1, 7, 8, 0)
      session = create(:agenda_class_session, class_group: group, start: future, end: future + 1.hour)
      group.update!(schedule: [ { "day_of_week" => 1, "enabled" => false, "windows" => [] } ])

      described_class.new(group, old_schedule).call

      expect(session.reload.start).to eq(future)
    end

    it "grade igual não mexe em nada" do
      future = calendar.zone.local(2030, 1, 7, 8, 0)
      session = create(:agenda_class_session, class_group: group, start: future, end: future + 1.hour)

      expect { described_class.new(group, old_schedule).call }.not_to(change { session.reload.updated_at })
    end

    it "a aula movida à mão fica onde está, e passa a ocupar o horário novo da grade" do
      future = calendar.zone.local(2030, 1, 7, 8, 0)
      moved_to = calendar.zone.local(2030, 1, 8, 15, 0)
      session = create(:agenda_class_session, class_group: group, start: future, end: future + 1.hour)
      session.update!(start: moved_to, end: moved_to + 1.hour)

      reschedule("10:00")

      expect(session.reload).to have_attributes(start: moved_to, end: moved_to + 1.hour, slot_start: calendar.zone.local(2030, 1, 7, 10, 0))
    end

    it "a aula avulsa fora da grade não se mexe" do
      extra = calendar.zone.local(2030, 1, 8, 15, 0)
      session = create(:agenda_class_session, class_group: group, start: extra, end: extra + 1.hour)

      reschedule("10:00")

      expect(session.reload).to have_attributes(start: extra, slot_start: extra)
    end
  end

  describe Agenda::SessionSlot do
    include ActiveSupport::Testing::TimeHelpers

    let(:organization) { create(:organization) }
    let(:calendar) { create(:agenda_calendar, :class_group, organization: organization) }
    let(:group) { create(:agenda_class_group, calendar: calendar) }

    around { |example| travel_to(Time.utc(2030, 1, 1, 12, 0)) { example.run } }

    def virtual_id(date = "20300107", time = "0800")
      "vcs_#{group.id}_#{date}_#{time}"
    end

    it "acha a aula calculada e a materializa no fuso do calendário" do
      slot = described_class.resolve(organization.id, virtual_id)

      expect(slot).to be_virtual
      expect(slot.slot).to eq(day_of_week: 1, window_start: "08:00")

      session = slot.materialize!

      expect(session.start).to eq(calendar.zone.local(2030, 1, 7, 8, 0))
      expect(session.end).to eq(calendar.zone.local(2030, 1, 7, 9, 0))
      expect(described_class.resolve(organization.id, virtual_id).session).to eq(session)
    end

    it "materializar duas vezes não duplica" do
      slot = described_class.resolve(organization.id, virtual_id)

      expect { 2.times { slot.materialize! } }.to change { Agenda::ClassSession.count }.by(1)
    end

    it "duas requisições ao mesmo tempo ficam com a mesma aula, pelo índice único" do
      Agenda::ClassSession.create_indexes
      first = described_class.resolve(organization.id, virtual_id)
      second = described_class.resolve(organization.id, virtual_id)

      session = first.materialize!

      expect(second.materialize!).to eq(session)
      expect(Agenda::ClassSession.count).to eq(1)
    ensure
      Agenda::ClassSession.remove_indexes
    end

    it "a aula movida continua achada pelo id calculado, e com os inscritos do horário da grade" do
      enrollment = create(:agenda_class_enrollment, class_group: group, schedule_day_of_week: 1, schedule_window_start: "08:00")
      session = described_class.resolve(organization.id, virtual_id).materialize!
      moved_to = calendar.zone.local(2030, 1, 8, 15, 0)
      session.update!(start: moved_to, end: moved_to + 1.hour)

      slot = described_class.resolve(organization.id, virtual_id)

      expect(slot.session).to eq(session)
      expect(slot.slot).to eq(day_of_week: 1, window_start: "08:00")
      expect(slot.enrollments.to_a).to eq([ enrollment ])
      expect { slot.materialize! }.not_to(change { Agenda::ClassSession.count })
      expect(session.reload.enrollment_count).to eq(1)
    end

    it "não acha turma de outra organização, nem horário fora da grade" do
      expect(described_class.resolve(create(:organization).id, virtual_id)).to be_nil
      expect(described_class.resolve(organization.id, virtual_id("20300107", "0300"))).to be_nil
      expect(described_class.resolve(organization.id, "vcs_quebrado")).to be_nil
      expect(described_class.resolve(organization.id, "qualquer")).to be_nil
    end

    it "com turma, recusa aula de outra turma" do
      other = create(:agenda_class_group, calendar: calendar)

      expect(described_class.resolve(organization.id, virtual_id, class_group: other)).to be_nil
    end

    it "junta os registros com quem está inscrito e sem registro" do
      marked = create(:agenda_class_enrollment, class_group: group)
      pending = create(:agenda_class_enrollment, class_group: group)
      slot = described_class.resolve(organization.id, virtual_id)
      session = slot.materialize!
      create(:agenda_class_attendance, class_session: session, class_enrollment: marked, chat: marked.chat, attendance_status: "show", guest: false)

      attendees = slot.attendees

      expect(attendees.map { |item| item[:id] }).to include("ve_#{pending.id}")
      expect(attendees.find { |item| item[:chatId] == marked.chat_id.to_s }).to include(attendanceStatus: "show")
      expect(attendees.size).to eq(2)
    end

    it "quem se inscreveu depois da aula não aparece nela" do
      create(:agenda_class_enrollment, class_group: group, enrolled_at: calendar.zone.local(2030, 1, 8, 12, 0))

      expect(described_class.resolve(organization.id, virtual_id).attendees).to be_empty
    end
  end

  describe Chats::BackfillSystemTagsService do
    let(:organization) { create(:organization) }
    let(:calendar) { create(:agenda_calendar, organization: organization) }
    let(:chat) { create(:chat, organization_id: organization.id) }

    def attended(status, at:, **attributes)
      create(:agenda_booking, { calendar: calendar, chat: chat, skip_professional_notifications: true, start: at, end: at + 1.hour }.merge(attributes))
        .tap { |booking| booking.set(attendance_status: status) }
    end

    it "aplica o resultado mais recente de cada conversa" do
      attended("show", at: 3.months.ago)
      attended("no_show", at: 1.month.ago)

      stats = described_class.new(organization).call

      expect(chat.reload.chat_tags.map(&:name)).to eq([ "nao-compareceu" ])
      expect(stats).to include(attendance_events: 2, attendance_tagged: 1)
    end

    it "ignora cancelado e o que está fora da janela" do
      attended("show", at: 1.month.ago, status: "canceled")
      attended("show", at: 2.years.ago)

      described_class.new(organization).call

      expect(chat.reload.chat_tag_ids).to be_empty
    end

    it "sem gravar, só conta" do
      attended("show", at: 1.month.ago)

      expect(described_class.new(organization, dry_run: true).call).to include(attendance_tagged: 1)
      expect(chat.reload.chat_tag_ids).to be_empty
    end

    it "não toca em conversa de outra organização" do
      other_chat = create(:chat, organization_id: create(:organization).id)
      attended("show", at: 1.month.ago).set(chat_id: other_chat.id)

      stats = described_class.new(organization).call

      expect(other_chat.reload.chat_tag_ids).to be_empty
      expect(stats).to include(attendance_orphans: 1)
    end
  end

  describe ChatRelations::Agenda do
    let(:calendar) { create(:agenda_calendar, time_zone: "America/Sao_Paulo") }
    let(:chat) { create(:chat, organization_id: calendar.organization_id) }

    it "lista os agendamentos por vir, no fuso do calendário" do
      start_at = calendar.zone.local(2.years.from_now.year, 1, 14, 22, 30)
      booking = create(:agenda_booking, calendar: calendar, chat: chat, start: start_at, end: start_at + 1.hour, skip_professional_notifications: true)
      past = 2.days.ago
      create(:agenda_booking, calendar: calendar, chat: chat, start: past, end: past + 1.hour, skip_professional_notifications: true)

      expect(chat.future_bookings_json).to eq([ {
        booking_id: booking.id.to_s,
        start: start_at.strftime("%Y-%m-%d 22:30"),
        end: start_at.strftime("%Y-%m-%d 23:30"),
        service_name: nil,
        employee_name: nil
      } ])
    end

    it "apagar a conversa leva junto o que é dela" do
      booking = create(:agenda_booking, calendar: calendar, chat: chat, skip_professional_notifications: true)
      action = create(:scheduled_action, chat: chat)

      chat.destroy

      expect(Agenda::Booking.where(id: booking.id)).not_to exist
      expect(ScheduledAction.where(id: action.id)).not_to exist
    end

    it "transmite o trabalho agendado quando a automação muda" do
      expect { chat.update!(automation_enabled: false) }
        .to have_broadcasted_to(ChatMessage::Base.stream_for(chat)).with(hash_including(event: "scheduled_actions_changed"))
    end

    it "não transmite em mudança que não é de automação" do
      chat

      expect { chat.update!(user_name: "Outra") }.not_to have_broadcasted_to(ChatMessage::Base.stream_for(chat))
    end
  end

  describe ConnectorEventService do
    let(:organization) { create(:organization) }
    let(:calendar) { create(:agenda_calendar, organization: organization) }
    let(:professional) { create(:agenda_professional, calendar: calendar, name: "Dra. Ana", external_id: "ERP-P") }
    let(:service) { create(:agenda_offering, calendar: calendar, name: "Limpeza", external_id: "ERP-S", professionals: [ professional ]) }
    let(:chat) { create(:chat, organization_id: organization.id, user_name: "Maria", external_id: "5531971810932@s.whatsapp.net") }

    it "preenche as variáveis com o agendamento de verdade" do
      booking = create(:agenda_booking, calendar: calendar, chat: chat, professional: professional, service: service, external_id: "ERP-B", skip_professional_notifications: true)
      map = described_class.new(organization, chat).send(:make_model_variables_map, booking)

      expect(map).to include(
        "booking.external_id" => "ERP-B",
        "booking.employee_name" => "Dra. Ana",
        "booking.service_name" => "Limpeza",
        "service.external_id" => "ERP-S",
        "employee.external_id" => "ERP-P",
        "customer.name" => "Maria",
        "customer.number" => "5531971810932"
      )
    end
  end
end
