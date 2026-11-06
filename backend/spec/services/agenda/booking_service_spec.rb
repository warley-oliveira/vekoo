require "rails_helper"

RSpec.describe Agenda::BookingService do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }
  let(:calendar) { create(:agenda_calendar, organization: organization, time_zone: "America/Sao_Paulo") }
  let(:ana) { create(:agenda_professional, :with_rule, calendar: calendar, name: "Ana") }
  let(:bia) { create(:agenda_professional, :with_rule, calendar: calendar, name: "Bia") }
  let!(:offering) { create(:agenda_offering, calendar: calendar, name: "Limpeza", duration: 60, time_increment_interval: 30, professionals: [ ana ]) }
  let(:chat) { create(:chat, organization_id: organization.id) }

  subject(:service) { described_class.new(calendar, chat: chat) }

  # Uma segunda-feira, 09:00 em São Paulo (12:00 UTC).
  let(:monday) { calendar.zone.local(2030, 1, 14, 8, 0) }

  before { travel_to(Time.utc(2030, 1, 13, 12, 0)) }
  after { travel_back }

  describe "#available_slots" do
    def slots(**options)
      service.available_slots(service_name: "Limpeza", date_start: "2030-01-14", date_end: "2030-01-14", **options)
    end

    it "oferece da abertura até o último início em que o serviço inteiro cabe" do
      result = slots

      day = result[:available_slots].fetch("segunda-feira, 2030-01-14")
      expect(day.first).to eq("09:00")
      # Janela até 17:00, serviço de 1 hora: 16:00 cabe, 16:30 não. A origem oferecia 16:30.
      expect(day.last).to eq("16:00")
      expect(result[:employee_name]).to eq("Ana")
    end

    it "calcula a janela no fuso do calendário, com o servidor em UTC" do
      calendar.update!(time_zone: "Asia/Tokyo")

      result = slots(date_start: "2030-01-15", date_end: "2030-01-15")

      expect(result[:available_slots].keys).to eq([ "terça-feira, 2030-01-15" ])
      expect(result[:available_slots].values.first.first).to eq("09:00")
    end

    it "usa o dia da semana do fuso do calendário, e não o de UTC" do
      # 22:00 de domingo em São Paulo já é segunda-feira em UTC. O domingo está fechado.
      travel_to(Time.utc(2030, 1, 14, 1, 0))

      result = service.available_slots(service_name: "Limpeza", date_start: "2030-01-13 00:00", date_end: "2030-01-13 23:59")

      expect(result[:messages]).to include("No available slots were found")
      expect(result[:available_slots].keys.first).to start_with("segunda-feira, 2030-01-14")
    end

    it "respeita a virada do horário de verão no fuso do calendário" do
      calendar.update!(time_zone: "America/New_York")

      # 10/03/2030: Nova York adianta o relógio às 2h. A hora de parede continua sendo 09:00.
      travel_to(Time.utc(2030, 3, 9, 12, 0))

      result = service.available_slots(service_name: "Limpeza", date_start: "2030-03-11", date_end: "2030-03-11")
      expect(result[:available_slots].values.first.first).to eq("09:00")

      # Antes e depois da virada, a mesma hora de parede é outro instante em UTC.
      expect(calendar.zone.local(2030, 3, 11, 9, 0).utc.hour).to eq(13)
      expect(calendar.zone.local(2030, 3, 8, 9, 0).utc.hour).to eq(14)
    end

    it "não oferece horário que já passou" do
      travel_to(calendar.zone.local(2030, 1, 14, 16, 0))

      # O mínimo é daqui a 15 minutos, e o último início que cabe no dia era 16:00.
      expect(slots[:available_slots].keys.first).not_to eq("segunda-feira, 2030-01-14")
    end

    it "não oferece horário ocupado" do
      start_at = calendar.zone.local(2030, 1, 14, 10, 0)
      create(:agenda_booking, calendar: calendar, professional: ana, start: start_at, end: start_at + 1.hour, skip_professional_notifications: true)

      day = slots[:available_slots].values.first

      expect(day).not_to include("10:00", "10:30", "09:30")
      expect(day).to include("09:00", "11:00")
    end

    it "agendamento cancelado libera o horário" do
      start_at = calendar.zone.local(2030, 1, 14, 10, 0)
      booking = create(:agenda_booking, calendar: calendar, professional: ana, start: start_at, end: start_at + 1.hour)
      booking.update!(status: "canceled")

      expect(slots[:available_slots].values.first).to include("10:00")
    end

    it "respeita a folga antes e depois do serviço" do
      offering.update!(buffer_before: 30, buffer_after: 30)
      start_at = calendar.zone.local(2030, 1, 14, 12, 0)
      create(:agenda_booking, calendar: calendar, professional: ana, start: start_at, end: start_at + 1.hour)

      day = slots[:available_slots].values.first

      # Ocupado das 12 às 13. Com meia hora de folga, 11:00 terminaria colado e 13:00 começaria colado.
      expect(day).not_to include("11:00", "11:30", "12:00", "12:30", "13:00")
      expect(day).to include("10:30", "13:30")
    end

    it "com limite de pessoas, só lota quando bate o limite" do
      offering.update!(guest_limit: 2)
      start_at = calendar.zone.local(2030, 1, 14, 10, 0)
      create(:agenda_booking, calendar: calendar, professional: ana, start: start_at, end: start_at + 1.hour)

      expect(slots[:available_slots].values.first).to include("10:00")

      create(:agenda_booking, calendar: calendar, professional: ana, start: start_at, end: start_at + 1.hour)
      expect(slots[:available_slots].values.first).not_to include("10:00")
    end

    it "não oferece bloqueio, em hora de parede do calendário" do
      ana.rule.update!(blocked_times: [ { "start" => "2030-01-14 13:00", "end" => "2030-01-14 15:00" } ])

      day = slots[:available_slots].values.first

      expect(day).not_to include("12:30", "13:00", "14:30")
      expect(day).to include("12:00", "15:00")
    end

    it "dia desligado não oferece nada, mesmo com janelas guardadas" do
      ana.rule.update!(days: [ { "day_of_week" => 1, "enabled" => false, "windows" => [ { "start" => "09:00", "end" => "17:00" } ] } ])

      result = service.available_slots(service_name: "Limpeza", date_start: "2030-01-14", date_end: "2030-01-14")

      expect(result).to eq(error: "No available slots")
    end

    it "sem horário no período, olha os próximos 30 dias e devolve o primeiro dia" do
      result = service.available_slots(service_name: "Limpeza", date_start: "2030-01-13", date_end: "2030-01-13")

      expect(result[:messages]).to include("The next available slots are on segunda-feira, 2030-01-14")
      expect(result[:available_slots].size).to eq(1)
    end

    it "serviço que não existe devolve os que existem" do
      expect(service.available_slots(service_name: "Outro", date_start: "2030-01-14", date_end: "2030-01-14"))
        .to eq(error: "service doesn't exists", use_one_of_this_services: [ "Limpeza" ])
    end

    it "serviço de outro calendário é serviço que não existe" do
      other = create(:agenda_offering, calendar: create(:agenda_calendar, organization: organization), name: "Só lá")

      expect(service.available_slots(service_name: other.name, date_start: "2030-01-14", date_end: "2030-01-14")[:error]).to be_present
    end

    it "profissional que não existe" do
      expect(slots(employee_name: "Zé")[:error]).to eq("employee not found")
    end

    it "profissional que não faz o serviço devolve quem faz" do
      bia

      result = slots(employee_name: "Bia")

      expect(result[:error]).to include("not allowed")
      expect(result[:employees_can_perform_this_service][:employee_name]).to eq("Ana")
    end

    it "diz quem seria o da vez quando escolhem outro" do
      offering.update!(distribution: { ana.id.to_s => 90, bia.id.to_s => 10 })

      result = slots(employee_name: "Bia")

      expect(result[:employee_name]).to eq("Bia")
      expect(result[:employee_with_priority]).to eq("Ana")
    end

    it "levanta sem os obrigatórios, e com data que não dá para ler" do
      expect { service.available_slots(service_name: "", date_start: "2030-01-14", date_end: "2030-01-14") }.to raise_error(ArgumentError)
      expect { service.available_slots(service_name: "Limpeza", date_start: "ontem", date_end: "2030-01-14") }.to raise_error(ArgumentError)
    end

    it "não vaza conflito de outra organização, como a origem fazia sem profissional" do
      other_calendar = create(:agenda_calendar)
      start_at = calendar.zone.local(2030, 1, 14, 10, 0)
      create(:agenda_booking, calendar: other_calendar, start: start_at, end: start_at + 1.hour)

      expect(slots[:available_slots].values.first).to include("10:00")
    end

    it "consulta a ocupação uma vez, e não uma por horário" do
      counter = Class.new do
        attr_accessor :active, :commands

        def started(event)
          commands << event.command_name if active && event.command.values.first == "agenda_bookings"
        end

        def succeeded(_event) = nil
        def failed(_event) = nil
      end.new
      counter.commands = []
      Mongoid.default_client.subscribe(Mongo::Monitoring::COMMAND, counter)

      counter.active = true
      service.available_slots(service_name: "Limpeza", date_start: "2030-01-14", date_end: "2030-02-14")
      counter.active = false

      # O balanceamento do serviço e a ocupação do profissional: 32 dias não mudam a conta.
      expect(counter.commands.size).to eq(2)
    end
  end

  describe "#booking_allowed?" do
    let(:at) { calendar.zone.local(2030, 1, 14, 10, 0) }

    it "pode dentro da janela, sem conflito" do
      expect(service.booking_allowed?(ana.id, offering.id, at)).to be(true)
    end

    it "não pode se o serviço estoura o fim da janela" do
      expect(service.booking_allowed?(ana.id, offering.id, calendar.zone.local(2030, 1, 14, 16, 30))).to be(false)
    end

    it "não pode fora do dia de atendimento" do
      expect(service.booking_allowed?(ana.id, offering.id, calendar.zone.local(2030, 1, 13, 10, 0))).to be(false)
    end

    it "não pode com conflito" do
      create(:agenda_booking, calendar: calendar, professional: ana, start: at, end: at + 1.hour)

      expect(service.booking_allowed?(ana.id, offering.id, at)).to be(false)
    end

    it "não pode profissional ou serviço de outro calendário" do
      other = create(:agenda_professional, :with_rule)

      expect(service.booking_allowed?(other.id, offering.id, at)).to be(false)
    end

    it "avalia o instante no fuso do calendário" do
      # 12:00 UTC é 09:00 em São Paulo: abre agora. 11:59 UTC ainda é 08:59.
      expect(service.booking_allowed?(ana.id, offering.id, Time.utc(2030, 1, 14, 12, 0))).to be(true)
      expect(service.booking_allowed?(ana.id, offering.id, Time.utc(2030, 1, 14, 11, 59))).to be(false)
    end
  end

  describe "#create_booking" do
    it "cria no horário de parede do calendário, ignorando o deslocamento do texto" do
      result = service.create_booking(employee_name: "Ana", service_name: "Limpeza", start_time: "2030-01-14T10:00:00Z", external_id: "ERP-1")

      expect(result).to include(success: true, service_duration: 60)
      booking = Agenda::Booking.find(result[:booking_id])
      expect(booking.local_start.strftime("%Y-%m-%d %H:%M")).to eq("2030-01-14 10:00")
      expect(booking.end - booking.start).to eq(1.hour)
      expect(booking).to have_attributes(chat_id: chat.id, external_id: "ERP-1", professional_id: ana.id, service_id: offering.id)
      expect(service).to be_created_booking
    end

    it "manda a instrução de sucesso do serviço" do
      offering.update!(success_message: "Avise que é para chegar 10 minutos antes")

      expect(service.create_booking(employee_name: "Ana", service_name: "Limpeza", start_time: "2030-01-14 10:00")[:message_instruction])
        .to eq("Avise que é para chegar 10 minutos antes")
    end

    it "horário ocupado devolve os próximos livres, sem criar" do
      start_at = calendar.zone.local(2030, 1, 14, 10, 0)
      create(:agenda_booking, calendar: calendar, professional: ana, start: start_at, end: start_at + 1.hour)

      result = nil
      expect { result = service.create_booking(employee_name: "Ana", service_name: "Limpeza", start_time: "2030-01-14 10:00") }
        .not_to(change { Agenda::Booking.count })

      expect(result[:message]).to eq("This slot is not available")
      expect(result[:next_available_slots][:available_slots]).to be_present
    end

    {
      "profissional que não existe" => [ { employee_name: "Zé" }, "this employee does not exist" ],
      "serviço que não existe" => [ { service_name: "Outro" }, "this service does not exist" ],
      "horário ilegível" => [ { start_time: "qualquer coisa" }, "start_time is invalid" ],
      "dia sem atendimento" => [ { start_time: "2030-01-13 10:00" }, "this employee is not available on this day" ]
    }.each do |description, (overrides, error)|
      it "recusa #{description}" do
        result = service.create_booking(employee_name: "Ana", service_name: "Limpeza", start_time: "2030-01-14 10:00", **overrides)

        expect(result[:error]).to eq(error)
      end
    end

    it "recusa profissional que não faz o serviço, e diz quem faz" do
      bia

      result = service.create_booking(employee_name: "Bia", service_name: "Limpeza", start_time: "2030-01-14 10:00")

      expect(result).to include(error: "this employee does not perform this service", employees_can_perform_this_service: [ "Ana" ])
    end
  end

  describe "#cancel_booking" do
    it "cancela e chama os eventos de conector" do
      booking = create(:agenda_booking, calendar: calendar, professional: ana, chat: chat)
      events = instance_double(ConnectorEventService, delete_booking_connector_call: nil)
      allow(ConnectorEventService).to receive(:new).and_return(events)

      expect(service.cancel_booking(booking_id: booking.id.to_s)).to eq(message: "Booking canceled successfully")
      expect(booking.reload).to be_canceled
      expect(events).to have_received(:delete_booking_connector_call).with(booking)
    end

    it "não alcança agendamento de outro calendário" do
      other = create(:agenda_booking)

      expect(service.cancel_booking(booking_id: other.id.to_s)).to eq(message: "Booking not found")
      expect(other.reload).to be_active
    end
  end

  describe "listas" do
    it "lista os serviços, com o profissional da vez" do
      expect(service.list_services).to eq([ { "service_name" => "Limpeza", "duration" => 60, "employee_with_priority" => "Ana" } ])
    end

    it "lista os profissionais, com os serviços de cada um" do
      ana

      expect(service.list_professionals).to eq([ { "name" => "Ana", "list_of_allowed_services_of_this_employee" => [ "Limpeza" ] } ])
    end

    it "avisa quando não há nada" do
      empty = described_class.new(create(:agenda_calendar, organization: organization))

      expect(empty.list_services).to eq(error: "No service available")
      expect(empty.list_professionals).to eq(error: "No employee available")
    end

    it "lista os agendamentos por vir da conversa, no fuso do calendário" do
      at = calendar.zone.local(2030, 1, 14, 22, 30)
      create(:agenda_booking, calendar: calendar, chat: chat, professional: ana, service: offering, start: at, end: at + 1.hour)

      expect(service.list_bookings).to contain_exactly(include("start" => "2030-01-14 22:30", "end" => "2030-01-14 23:30", "employee_name" => "Ana", "service_name" => "Limpeza"))
      expect(service.list_bookings(true).first["employee"]).to include("name" => "Ana")
    end

    it "sem conversa, a lista é vazia" do
      expect(described_class.new(calendar).list_bookings).to eq([])
    end
  end

  describe "#update_external_id" do
    it "grava, só no próprio calendário" do
      booking = create(:agenda_booking, calendar: calendar)

      expect(service.update_external_id(booking_id: booking.id.to_s, external_id: "X")).to eq(success: true)
      expect(booking.reload.external_id).to eq("X")
      expect(service.update_external_id(booking_id: create(:agenda_booking).id.to_s, external_id: "X")).to eq(error: "Booking not found")
    end
  end
end
