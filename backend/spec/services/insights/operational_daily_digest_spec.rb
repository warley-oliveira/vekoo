require "rails_helper"

RSpec.describe Insights::OperationalDailyDigest do
  subject(:digest) { described_class.new(organization_id: organization.id, range: range, zone: zone) }

  let(:organization) { create(:organization) }
  let(:zone) { ActiveSupport::TimeZone["America/Sao_Paulo"] }
  let(:range) { day_range(zone.today, zone) }

  describe "#to_h" do
    it "expõe exatamente as chaves declaradas em ALL_KEYS" do
      expect(digest.to_h.keys).to match_array(described_class::ALL_KEYS)
    end

    it "isola falha de um bloco sem derrubar os demais" do
      allow(Insights::MessageVolumeDaily).to receive(:new).and_raise(Mongo::Error::OperationFailure)
      allow(Rails.logger).to receive(:error)

      result = digest.to_h

      expect(result).to include(messages_sent_by_automation: 0, messages_by_account: {})
      expect(result).to include(first_response_automation_count: 0, chats_by_channel: {})
      expect(digest.hourly).to eq({})
    end

    it "calcula horas economizadas e mensagens evitadas a partir do volume" do
      noon = range.first + 12.hours
      chat = create(:chat, organization: organization, created_at: noon, last_message_at: noon)
      10.times { add_message(chat, kind: :automation, at: noon) }
      add_message(chat, kind: :human, at: noon)

      expect(digest.to_h).to include(
        hours_saved: 0.35, # 10 mensagens * 2,1 minutos
        messages_avoided: 9,
        chats_started: 1
      )
    end

    it "conta como pela automação só o agendamento criado sem pessoa, e sem vir do Google" do
      calendar = create(:agenda_calendar, organization: organization)
      create(:agenda_booking, calendar: calendar, created_at: range.first + 1.hour)
      create(:agenda_booking, calendar: calendar, created_at: range.first + 1.hour, event_user_name: "Marina")
      connector = Connector::GoogleCalendar.new(organization_id: organization.id.to_s)
      connector.save!(validate: false)
      create(:agenda_booking, calendar: calendar, created_at: range.first + 1.hour, connector: connector, skip_google_push: true)
      create(:agenda_booking, calendar: calendar, created_at: range.first - 1.day)

      expect(digest.to_h[:automation_bookings]).to eq(1)
    end
  end

  # Guarda de contrato: DailyChatStat.sum_stat faz (metrics->>'k')::float, que levanta erro em
  # valor-objeto do jsonb. Chave-hash exposta como campo de dashboard personalizado viraria 500.
  describe "contrato escalar x hash" do
    it "mantém SCALAR_KEYS e HASH_KEYS disjuntos" do
      expect(described_class::SCALAR_KEYS & described_class::HASH_KEYS).to be_empty
    end
  end
end
