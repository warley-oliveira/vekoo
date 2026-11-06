require "rails_helper"

RSpec.describe MiniRacerEngine::Workers::Scheduling do
  let(:organization) { create(:organization) }
  let(:chat) { create(:chat, organization: organization) }
  let(:calendar) { create(:agenda_calendar, organization_id: organization.id.to_s) }
  let(:professional) { create(:agenda_professional, :with_rule, calendar: calendar, name: "Camila") }
  let(:service) { create(:agenda_offering, calendar: calendar, name: "Prova", professionals: [ professional ]) }

  def run(code, chat: self.chat)
    run_script(code, organization: organization, chat: chat)
  end

  before { professional.update!(service_ids: [ service.id ]) }

  it "mantém os nomes `appointment.*` da origem" do
    %w[services serviceAvailableSlots cancel employees create scheduledList updateExternalId].each do |name|
      expect(run("return typeof appointment.#{name};")).to eq("function")
    end
    expect(run("return typeof booking;")).to eq("undefined")
  end

  it "lista serviços e profissionais do calendário padrão" do
    expect(run("return appointment.services();").first).to include("service_name" => "Prova")
    expect(run("return appointment.employees();").first).to include("name" => "Camila", "list_of_allowed_services_of_this_employee" => [ "Prova" ])
  end

  it "não enxerga o calendário de outra organização" do
    other = create(:organization)
    other_calendar = create(:agenda_calendar, organization_id: other.id.to_s)
    create(:agenda_offering, calendar: other_calendar, name: "Serviço alheio")

    expect(run("return appointment.services();").pluck("service_name")).to eq([ "Prova" ])
  end

  it "marca, lista e cancela um horário da conversa" do
    start = "#{Date.current.next_occurring(:tuesday)} 10:00"

    created = run("return appointment.create('Camila', 'Prova', '#{start}', 'EXT-1');")

    expect(created).to include("success" => true, "service_duration" => 60)
    booking = chat.bookings.find(created["booking_id"])
    expect(booking.external_id).to eq("EXT-1")

    expect(run("return appointment.scheduledList();").first).to include("service_name" => "Prova", "booking_id" => booking.id.to_s)
    expect(run("return appointment.updateExternalId('#{booking.id}', 'EXT-2');")).to eq("success" => true)
    expect(booking.reload.external_id).to eq("EXT-2")
    expect(run("return appointment.cancel('#{booking.id}');")).to eq("message" => "Booking canceled successfully")
    expect(booking.reload.status).to eq("canceled")
  end

  it "mostra os horários vagos" do
    day = Date.current.next_occurring(:tuesday)

    result = run("return appointment.serviceAvailableSlots('Prova', '#{day} 00:00', '#{day} 23:59', 'Camila');")

    expect(result).to include("employee_name" => "Camila", "service_name" => "Prova")
    expect(result["available_slots"].values.flatten).not_to be_empty
  end

  it "não cancela agendamento de outra organização" do
    other_calendar = create(:agenda_calendar, organization_id: create(:organization).id.to_s)
    alheio = create(:agenda_booking, calendar: other_calendar)

    expect(run("return appointment.cancel('#{alheio.id}');")).to eq("message" => "Booking not found")
    expect(alheio.reload.status).not_to eq("canceled")
  end

  it "a data ruim vira erro para o script, sem exceção" do
    expect(run("return appointment.serviceAvailableSlots('', '2026-01-01', '2026-01-02');")).to eq("error" => "service_name cannot be blank")
  end

  it "sem conversa, a lista é vazia" do
    expect(run("return appointment.scheduledList();", chat: nil)).to eq([])
  end

  it "só cobra quando chamam: um script que não usa agenda não precisa de calendário nem de organização" do
    expect(run_script("return 1;")).to eq(1)
    expect { run_script("return appointment.services();") }.to raise_error(MiniRacer::RuntimeError, /No organization/)
  end

  it "sem calendário, o erro é para o script" do
    other = create(:organization)

    expect { run_script("return appointment.services();", organization: other) }.to raise_error(MiniRacer::RuntimeError, /No calendar/)
  end

  it "chamado direto, sem V8, o motor não exige cota" do
    session = MiniRacerEngine::SessionContext.new
    session.set(:organization, organization)
    extension = described_class.new
    extension.instance_variable_set(:@worker, MiniRacerEngine::Worker.new(session))

    expect(extension.send(:services, []).first).to include("service_name" => "Prova")
  end
end
