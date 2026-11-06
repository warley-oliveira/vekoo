require "rails_helper"

# Roda a semente de ponta a ponta, em cima da conta de demonstração, com os domínios de que depende.
RSpec.describe "db/seeds/agenda.rb" do
  let(:owner) { create(:account, email: "marina.duarte@exemplo.com.br", role: "owner", name: "Marina Duarte") }
  let(:organization) { owner.organization }

  def seed(file = "agenda")
    original = $stdout
    $stdout = StringIO.new
    load Rails.root.join("db/seeds/#{file}.rb")
  ensure
    $stdout = original
  end

  before do
    owner
    seed("access")
    seed
  end

  it "carrega as conversas que ela usa, mesmo vindo antes na ordem alfabética" do
    expect(organization.chats.count).to be >= 30
    expect(organization.agenda_bookings.where(:chat_id.ne => nil).count).to eq(18)
  end

  it "traz o calendário do estúdio, com profissionais, serviços e horários" do
    calendar = organization.agenda_calendars.where(name: "Estúdio Doma").take

    expect(calendar).to have_attributes(calendar_type: "professional", time_zone: "America/Sao_Paulo", scheduling_notification_enabled: true)
    expect(calendar.attendance_sequences.map { |item| item["name"] }).to eq([ "Recuperar quem faltou", "Agradecer quem veio" ])

    expect(organization.agenda_professionals.pluck(:name)).to contain_exactly("Camila Rocha", "Thiago Almeida", "Renata Vieira")
    expect(organization.agenda_services.pluck(:name)).to contain_exactly("Prova com hora marcada", "Ajuste de roupa", "Consultoria de estilo")

    camila = organization.agenda_professionals.where(name: "Camila Rocha").take
    expect(camila.account_id).to be_present
    expect(camila.rule.windows_on(1).size).to eq(2)
    expect(camila.rule.windows_on(0)).to be_empty
    expect(camila.service_ids.size).to eq(2)
  end

  it "traz agendamentos passados e futuros, com comparecimento e etiqueta" do
    bookings = organization.agenda_bookings.to_a

    expect(bookings.count { |booking| booking.start.past? }).to be > 5
    expect(bookings.count { |booking| booking.start.future? }).to be > 5
    expect(bookings.map(&:attendance_status).compact.tally).to include("show", "no_show")
    expect(bookings.map(&:status)).to include("canceled")

    attended = bookings.find { |booking| booking.attendance_status == "show" }
    expect(attended.chat.chat_tags.map(&:name)).to include("compareceu")
    expect(attended.event_history.map { |entry| entry["event_name"] }).to eq(%w[create show])
  end

  it "os horários seguem as horas de parede do calendário" do
    expect(organization.agenda_bookings.where(external_id: "seed-agenda-11").take.local_start.strftime("%H:%M")).to eq("10:00")
  end

  it "agenda os lembretes das que estão por vir, sem avisar os profissionais" do
    actions = ScheduledAction.pending.where(organization_id: organization.id.to_s)

    expect(actions.count).to be > 0
    expect(actions.map(&:booking_id).uniq.size).to be > 3
    expect(AccountNotice.where(organization_id: organization.id.to_s, category: "calendar", title: "Novo agendamento").count).to eq(0)
  end

  it "traz turmas com grade, inscritos, aula com presença e aula cancelada" do
    calendar = organization.agenda_calendars.where(name: "Oficinas Doma").take
    group = calendar.class_groups.where(name: "Oficina de costura criativa").take

    expect(calendar.calendar_type).to eq("class_group")
    expect(group.class_enrollments.active.count).to eq(4)
    expect(group.class_sessions.where(status: "canceled").count).to eq(1)

    attended = group.class_sessions.where(notes: "Presença marcada pela semente").take
    expect(attended.class_attendances.map(&:attendance_status)).to include("show", "no_show")
  end

  it "o calendário fica de pé pela listagem" do
    events = Agenda::EventQuery.new(organization, start: 7.days.ago.iso8601, end: 7.days.from_now.iso8601).call

    expect(events.map { |event| event[:type] }.uniq).to contain_exactly("booking", "class_session")
  end

  it "rodar de novo não duplica nada" do
    counts = lambda do
      [
        organization.agenda_calendars.count, organization.agenda_professionals.count, organization.agenda_services.count,
        organization.agenda_bookings.count, organization.agenda_class_groups.count, Agenda::Rule.count,
        Agenda::ClassEnrollment.count, Agenda::ClassSession.count, Agenda::ClassAttendance.count,
        ScheduledAction.where(organization_id: organization.id.to_s).count
      ]
    end

    expect { seed }.not_to(change(&counts))
  end

  it "não desfaz o que a pessoa mudou" do
    calendar = organization.agenda_calendars.where(name: "Estúdio Doma").take
    calendar.update!(color: "#000000")
    booking = organization.agenda_bookings.where(external_id: "seed-agenda-11").take
    booking.update!(title: "Mudei")

    seed

    expect(calendar.reload.color).to eq("#000000")
    expect(booking.reload.title).to eq("Mudei")
  end

  it "sem a conta de demonstração, não faz nada" do
    owner.destroy!

    expect { seed }.not_to(change { Agenda::Calendar.count })
  end
end
