require "rails_helper"

RSpec.describe ScheduledAction do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }
  let(:calendar) { create(:agenda_calendar, organization: organization) }
  let(:chat) { create(:chat, organization_id: organization.id) }
  let(:booking) { create(:agenda_booking, calendar: calendar, chat: chat, skip_professional_notifications: true) }

  describe ".schedule_booking_reminder!" do
    let(:rule) { { "interval" => 2, "period" => "days", "message" => "Oi" } }

    def schedule(run_at = 1.hour.from_now)
      described_class.schedule_booking_reminder!(booking, rule, 0, run_at)
    end

    it "grava a linha e agenda o job, com o token no job" do
      action = nil

      expect { action = schedule }.to have_enqueued_job(Agenda::ContactNotificationJob)
        .with(booking.id.to_s, organization.id.to_s, 0, kind_of(String))

      expect(action).to have_attributes(status: :pending, chat_id: chat.id, booking_id: booking.id.to_s, name: "Lembrete: 2 dias antes")
      expect(action.metadata).to include("config_index" => 0, "booking_title" => "Consulta")
    end

    it "sem Redis, não deixa linha prometendo o que não vai sair, nem derruba o agendamento" do
      allow(Agenda::ContactNotificationJob).to receive(:set).and_raise(RedisClient::CannotConnectError)

      expect(schedule).to be_nil
      expect(described_class.pending.where(booking_id: booking.id.to_s)).to be_empty
    end

    it "fala cada unidade no singular e no plural" do
      {
        { "interval" => 1, "period" => "hours" } => "Lembrete: 1 hora antes",
        { "interval" => 3, "period" => "hours" } => "Lembrete: 3 horas antes",
        { "interval" => 1, "period" => "days" } => "Lembrete: 1 dia antes",
        { "interval" => 30, "period" => "minutes" } => "Lembrete: 30 minutos antes",
        { "interval" => 2, "period" => "qualquer" } => "Lembrete: 2 horas antes"
      }.each do |item, label|
        expect(described_class.reminder_label(item)).to eq(label)
      end
    end
  end

  describe ".supersede_for_booking!" do
    it "marca só as pendentes do agendamento" do
      pending = create(:scheduled_action, chat: chat, booking_id: "b1")
      executed = create(:scheduled_action, chat: chat, booking_id: "b1", status: :executed)
      other = create(:scheduled_action, chat: chat, booking_id: "b2")

      expect(described_class.supersede_for_booking!("b1")).to eq(1)

      expect(pending.reload).to be_superseded
      expect(executed.reload).to be_executed
      expect(other.reload).to be_pending
    end
  end

  describe "#claim!" do
    it "só uma execução ganha" do
      action = create(:scheduled_action, chat: chat)
      same = described_class.find(action.id)

      expect(action.claim!).to be(true)
      expect(same.claim!).to be(false)
      expect(action.reload).to be_executed
    end

    it "linha cancelada não é reivindicada" do
      action = create(:scheduled_action, chat: chat, status: :canceled)

      expect(action.claim!).to be(false)
    end
  end

  describe ".payload_for" do
    it "traz as pendentes em ordem, e o estado da automação" do
      later = create(:scheduled_action, chat: chat, scheduled_at: 2.hours.from_now)
      sooner = create(:scheduled_action, chat: chat, scheduled_at: 1.hour.from_now)
      create(:scheduled_action, chat: chat, status: :canceled)
      create(:scheduled_action, chat: create(:chat, organization_id: organization.id))

      resume_at = 1.hour.from_now.change(usec: 0)
      chat.update!(automation_enabled: false, automation_resume_at: resume_at)

      payload = described_class.payload_for(chat)

      expect(payload[:actions].map { |item| item[:id] }).to eq([ sooner.id.to_s, later.id.to_s ])
      expect(payload[:automation]).to eq(enabled: false, reactivatesAt: resume_at.to_i * 1000)
    end

    it "não promete o que se perdeu: passou muito da hora, sai da lista" do
      create(:scheduled_action, chat: chat, scheduled_at: 2.hours.ago)

      expect(described_class.payload_for(chat)[:actions]).to be_empty
    end

    it "nunca mostra o token" do
      create(:scheduled_action, chat: chat)

      expect(described_class.payload_for(chat)[:actions].first.keys).not_to include(:token)
    end
  end

  describe ".broadcast_for" do
    it "manda o retrato inteiro na stream da conversa" do
      expect { described_class.broadcast_for(chat) }.to have_broadcasted_to(ChatMessage::Base.stream_for(chat))
        .with(hash_including(event: "scheduled_actions_changed", chatId: chat.id.to_s))
    end

    it "sem conversa, não faz nada" do
      expect { described_class.broadcast_for(nil) }.not_to raise_error
    end
  end
end
