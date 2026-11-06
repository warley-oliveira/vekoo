require "rails_helper"

RSpec.describe Agenda::Offering do
  let(:calendar) { create(:agenda_calendar) }
  let(:ana) { create(:agenda_professional, calendar: calendar) }
  let(:bia) { create(:agenda_professional, calendar: calendar) }

  def offering(distribution, **attributes)
    build(:agenda_offering, { calendar: calendar, distribution: distribution }.merge(attributes))
  end

  describe "validações" do
    it "exige que a distribuição some 100" do
      record = offering({ ana.id.to_s => 60, bia.id.to_s => 30 })

      expect(record).not_to be_valid
      expect(record.errors[:distribution].first).to include("90")
    end

    it "converte os valores em inteiro antes de somar" do
      expect(offering({ ana.id.to_s => "60", bia.id.to_s => "40" })).to be_valid
    end

    it "recusa distribuição vazia, como na origem" do
      expect(offering({})).not_to be_valid
    end

    it "recusa profissional de outro calendário" do
      other = create(:agenda_professional)
      record = offering({ other.id.to_s => 100 })

      expect(record).not_to be_valid
      expect(record.errors[:distribution]).to be_present
    end

    it "recusa duração e intervalo que não sejam positivos, que travariam a busca de horários" do
      expect(offering({ ana.id.to_s => 100 }, duration: 0)).not_to be_valid
      expect(offering({ ana.id.to_s => 100 }, time_increment_interval: 0)).not_to be_valid
    end
  end

  describe "ao salvar" do
    it "liga os profissionais, e porcentagem zero desliga" do
      record = create(:agenda_offering, calendar: calendar, distribution: { ana.id.to_s => 50, bia.id.to_s => 50 })

      expect(ana.reload.service_ids).to include(record.id)
      expect(bia.reload.service_ids).to include(record.id)

      record.update!(distribution: { ana.id.to_s => 100, bia.id.to_s => 0 })

      expect(ana.reload.service_ids).to include(record.id)
      expect(bia.reload.service_ids).not_to include(record.id)
    end
  end

  describe "ao apagar" do
    it "não leva os agendamentos, que a origem apagava junto" do
      record = create(:agenda_offering, calendar: calendar, distribution: { ana.id.to_s => 100 })
      booking = create(:agenda_booking, calendar: calendar, service: record, professional: ana)

      record.destroy!

      expect(booking.reload.service_id).to be_nil
      expect(ana.reload.service_ids).not_to include(record.id)
    end
  end

  describe "#scheduler_balancer" do
    let(:record) { create(:agenda_offering, calendar: calendar, distribution: { ana.id.to_s => 70, bia.id.to_s => 30 }) }

    def book(professional, at: 1.day.from_now)
      create(:agenda_booking, calendar: calendar, service: record, professional: professional, start: at, end: at + 1.hour)
    end

    it "sem histórico, escolhe quem tem a maior parte" do
      expect(record.scheduler_balancer).to eq(ana.id.to_s)
    end

    it "escolhe quem está mais abaixo da sua parte" do
      3.times { book(ana) }

      expect(record.scheduler_balancer).to eq(bia.id.to_s)
    end

    it "só conta os ativos" do
      3.times { book(ana).update!(status: "canceled") }

      expect(record.scheduler_balancer).to eq(ana.id.to_s)
    end

    it "com período, só conta o que caiu nele" do
      date = Time.current.in_time_zone(calendar.zone)
      3.times { book(ana, at: date - 2.months) }

      expect(record.scheduler_balancer(date: date, period: "week")).to eq(ana.id.to_s)
      expect(record.scheduler_balancer).to eq(bia.id.to_s)
    end

    it "sem distribuição, não há da vez" do
      record.set(distribution: {})

      expect(record.scheduler_balancer).to be_nil
    end
  end
end
