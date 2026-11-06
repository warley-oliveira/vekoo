require "rails_helper"

RSpec.describe Agenda::SessionGeneratorService do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }
  let(:calendar) { create(:agenda_calendar, :class_group, organization: organization, time_zone: "America/Sao_Paulo") }
  # Segunda e quarta, 19h às 20h. Em UTC, 22h às 23h: o caso que a origem só acertava porque o
  # servidor rodava no fuso de São Paulo.
  let(:schedule) do
    [
      { "day_of_week" => 1, "enabled" => true, "windows" => [ { "start" => "19:00", "end" => "20:00" } ] },
      { "day_of_week" => 3, "enabled" => true, "windows" => [ { "start" => "19:00", "end" => "20:00" } ] }
    ]
  end
  let(:group) { create(:agenda_class_group, calendar: calendar, schedule: schedule, start_date: Date.new(2030, 1, 7)) }

  def generate(from, to, target = group)
    described_class.new(target, from, to).call
  end

  around { |example| travel_to(Time.utc(2030, 1, 1, 12, 0)) { example.run } }

  describe "#call" do
    it "calcula as aulas no fuso do calendário, sem gravar nada" do
      events = generate(Date.new(2030, 1, 7), Date.new(2030, 1, 13))

      expect(events.map { |event| event[:id] }).to eq([
        "vcs_#{group.id}_20300107_1900",
        "vcs_#{group.id}_20300109_1900"
      ])
      expect(Time.at(events.first[:start] / 1000).utc).to eq(Time.utc(2030, 1, 7, 22, 0))
      expect(Time.at(events.first[:end] / 1000).utc).to eq(Time.utc(2030, 1, 7, 23, 0))
      expect(events.first).to include(virtual: true, type: "class_session", status: "active", scheduleDayOfWeek: 1, scheduleWindowStart: "19:00")
      expect(Agenda::ClassSession.count).to eq(0)
    end

    it "a aula que passa da meia-noite em UTC continua no dia certo" do
      calendar.update!(time_zone: "Asia/Tokyo")

      # 08:00 em Tóquio é 23:00 do dia anterior em UTC.
      target = create(:agenda_class_group, calendar: calendar, schedule: [ { "day_of_week" => 1, "enabled" => true, "windows" => [ { "start" => "08:00", "end" => "09:00" } ] } ])
      event = generate(Date.new(2030, 1, 7), Date.new(2030, 1, 7), target).first

      expect(event[:id]).to end_with("20300107_0800")
      expect(Time.at(event[:start] / 1000).utc).to eq(Time.utc(2030, 1, 6, 23, 0))
    end

    it "sem fim na janela, usa a duração padrão" do
      group.update!(schedule: [ { "day_of_week" => 1, "enabled" => true, "windows" => [ { "start" => "19:00" } ] } ], default_duration_minutes: 45)

      event = generate(Date.new(2030, 1, 7), Date.new(2030, 1, 7)).first

      expect((event[:end] - event[:start]) / 60_000).to eq(45)
    end

    it "respeita o início e o fim da turma" do
      group.update!(end_date: Date.new(2030, 1, 9))

      expect(generate(Date.new(2029, 12, 1), Date.new(2030, 2, 1)).size).to eq(2)
    end

    it "turma inativa não gera nada" do
      group.update!(active: false)

      expect(generate(Date.new(2030, 1, 7), Date.new(2030, 1, 13))).to be_empty
    end

    it "a exceção gravada entra no lugar da aula calculada" do
      start_at = calendar.zone.local(2030, 1, 7, 19, 0)
      session = create(:agenda_class_session, class_group: group, start: start_at, end: start_at + 1.hour, status: "canceled")

      events = generate(Date.new(2030, 1, 7), Date.new(2030, 1, 7))

      expect(events.map { |event| event[:id] }).to eq([ session.id.to_s ])
      expect(events.first).to include(virtual: false, status: "canceled")
    end

    describe "contagem de inscritos" do
      def enroll(**attributes)
        create(:agenda_class_enrollment, { class_group: group }.merge(attributes))
      end

      it "conta quem é daquele horário e quem é de todos" do
        enroll(schedule_day_of_week: 1, schedule_window_start: "19:00")
        enroll(schedule_day_of_week: 3, schedule_window_start: "19:00")
        enroll

        counts = generate(Date.new(2030, 1, 7), Date.new(2030, 1, 9)).map { |event| event[:enrollmentCount] }

        expect(counts).to eq([ 2, 2 ])
      end

      it "não conta inscrição cancelada, nem quem se inscreveu depois da aula" do
        enroll(status: "canceled")
        enroll(enrolled_at: calendar.zone.local(2030, 1, 8, 12, 0))

        counts = generate(Date.new(2030, 1, 7), Date.new(2030, 1, 9)).map { |event| event[:enrollmentCount] }

        expect(counts).to eq([ 0, 1 ])
      end
    end
  end

  describe "recorrência" do
    let(:schedule) { [ { "day_of_week" => 1, "enabled" => true, "windows" => [ { "start" => "19:00", "end" => "20:00" } ] } ] }

    # O mesmo resultado, seja qual for o período que a tela pediu: a origem contava a partir do início
    # do período, e a turma quinzenal aparecia toda semana na visão semanal.
    it "quinzenal cai sempre nas mesmas semanas, em qualquer período" do
      group.update!(recurrence_type: "biweekly")

      days = (0..5).flat_map do |week|
        monday = Date.new(2030, 1, 7) + (week * 7)
        generate(monday, monday + 6).map { |event| event[:scheduleDayOfWeek] && event[:id].split("_")[2] }
      end

      expect(days).to eq(%w[20300107 20300121 20300204])
      expect(generate(Date.new(2030, 1, 7), Date.new(2030, 2, 10)).map { |event| event[:id].split("_")[2] }).to eq(days)
    end

    it "mensal é de quatro em quatro semanas" do
      group.update!(recurrence_type: "monthly")

      expect(generate(Date.new(2030, 1, 7), Date.new(2030, 3, 10)).map { |event| event[:id].split("_")[2] })
        .to eq(%w[20300107 20300204 20300304])
    end

    it "por número de ocorrências, para na mesma aula em qualquer período" do
      group.update!(recurrence_end_type: "occurrences", recurrence_occurrences: 3)

      expect(generate(Date.new(2030, 1, 7), Date.new(2030, 12, 31)).size).to eq(3)
      expect(generate(Date.new(2030, 1, 14), Date.new(2030, 1, 20)).size).to eq(1)
      expect(generate(Date.new(2030, 1, 28), Date.new(2030, 2, 3))).to be_empty
    end

    it "sem início definido, conta a partir da criação da turma" do
      target = create(:agenda_class_group, calendar: calendar, schedule: schedule, recurrence_type: "biweekly", created_at: Time.utc(2030, 1, 7, 12, 0))

      expect(generate(Date.new(2030, 1, 14), Date.new(2030, 1, 20), target)).to be_empty
      expect(generate(Date.new(2030, 1, 21), Date.new(2030, 1, 27), target).size).to eq(1)
    end
  end

  describe ".parse_virtual_id" do
    it "lê o id" do
      expect(described_class.parse_virtual_id("vcs_abc123_20300107_1900")).to eq(class_group_id: "abc123", date: Date.new(2030, 1, 7), time: "19:00")
    end

    %w[vcs_abc vcs_abc_20301332_1900 outro_abc_20300107_1900 vcs_a$b_20300107_1900].each do |id|
      it "recusa #{id}" do
        expect(described_class.parse_virtual_id(id)).to be_nil
      end
    end
  end

  describe ".virtual_start" do
    it "é o instante no fuso do calendário" do
      parsed = described_class.parse_virtual_id("vcs_#{group.id}_20300107_1900")

      expect(described_class.virtual_start(group, parsed)).to eq(Time.utc(2030, 1, 7, 22, 0))
    end

    it "não existe fora da grade" do
      parsed = described_class.parse_virtual_id("vcs_#{group.id}_20300107_0300")

      expect(described_class.virtual_start(group, parsed)).to be_nil
    end
  end
end
