require "rails_helper"

RSpec.describe Insights::OperationalRangeDigest do
  subject(:digest) { described_class.new(organization_id: organization.id, range: range, zone: zone) }

  let(:organization) { create(:organization) }
  let(:zone) { ActiveSupport::TimeZone["America/Sao_Paulo"] }
  let(:today) { zone.today }
  # Atravessa o limite de chunk mensal de propósito.
  let(:range) { zone.local((today - 45.days).year, (today - 45.days).month, (today - 45.days).day)...day_range(today, zone).last }
  let(:old_day) { today - 40.days }
  let(:recent_day) { today - 3.days }

  def noon(day)
    zone.local(day.year, day.month, day.day, 12)
  end

  def add_chat(created_at:, last_message_at: Time.current, audience_type: "whatsapp_api")
    create(:chat, organization: organization, audience_type: audience_type, created_at: created_at, last_message_at: last_message_at)
  end

  describe "#call" do
    it "distribui as métricas nos dias corretos, atravessando chunks mensais" do
      old_chat = add_chat(created_at: noon(old_day))
      add_message(old_chat, kind: :inbound, at: noon(old_day))
      add_message(old_chat, kind: :automation, at: noon(old_day) + 20.seconds)

      recent_chat = add_chat(created_at: noon(recent_day))
      2.times { add_message(recent_chat, kind: :inbound, at: noon(recent_day)) }
      add_message(recent_chat, kind: :automation, at: noon(recent_day) + 45.seconds)

      result = digest.call

      expect(result[old_day]).to include(
        messages_inbound: 1, messages_sent_by_automation: 1,
        first_response_automation_seconds_sum: 20.0, first_response_automation_count: 1
      )
      expect(result[recent_day]).to include(
        messages_inbound: 2, messages_sent_by_automation: 1,
        first_response_automation_seconds_sum: 45.0, first_response_automation_count: 1
      )
    end

    # Este é o motivo de a classe existir: o serviço diário limita `last_message_at < to + 1.day` e
    # devolveria zero para um dia antigo cuja conversa ainda está ativa hoje.
    it "conta mensagens antigas de conversa cuja última mensagem é de hoje" do
      chat = add_chat(created_at: noon(old_day), last_message_at: Time.current)
      add_message(chat, kind: :automation, at: noon(old_day))

      expect(digest.call[old_day]).to include(messages_sent_by_automation: 1)
      expect(Insights::MessageVolumeDaily.stale?(day_range(old_day, zone))).to be(true)
    end

    it "agrupa o ranking por dia e por pessoa" do
      chat = add_chat(created_at: noon(recent_day))
      add_message(chat, kind: :human, at: noon(recent_day), account_id: "conta-7")

      # Conversa própria do período antigo: uma mensagem não pode ser anterior à criação da conversa.
      old_chat = add_chat(created_at: noon(old_day))
      add_message(old_chat, kind: :human, at: noon(old_day), account_id: "conta-9")

      result = digest.call

      expect(result[recent_day][:messages_by_account]).to eq("conta-7" => 1)
      expect(result[old_day][:messages_by_account]).to eq("conta-9" => 1)
    end

    it "conta cada conversa ativa uma vez por dia, e as atendidas pela automação" do
      chat = add_chat(created_at: noon(old_day))
      2.times { add_message(chat, kind: :automation, at: noon(recent_day)) }
      add_message(chat, kind: :inbound, at: noon(old_day))

      result = digest.call

      expect(result[recent_day]).to include(active_chats: 1, automation_chats: 1)
      expect(result[old_day]).to include(active_chats: 1, automation_chats: 0)
    end

    it "distribui por hora local, dia a dia" do
      chat = add_chat(created_at: noon(old_day))
      add_message(chat, kind: :inbound, at: noon(old_day))
      add_message(chat, kind: :inbound, at: noon(recent_day) + 3.hours)

      result = digest.call

      expect(result[old_day][:hourly]).to eq("12" => 1)
      expect(result[recent_day][:hourly]).to eq("15" => 1)
    end

    it "não mistura os hashes entre dias diferentes" do
      first = add_chat(created_at: noon(old_day))
      add_message(first, kind: :human, at: noon(old_day), account_id: "conta-1")
      second = add_chat(created_at: noon(recent_day))
      add_message(second, kind: :human, at: noon(recent_day), account_id: "conta-2")

      result = digest.call

      expect(result[old_day][:messages_by_account]).to eq("conta-1" => 1)
      expect(result[recent_day][:messages_by_account]).to eq("conta-2" => 1)
    end

    it "ignora spans, que duplicariam a mesma mensagem" do
      chat = add_chat(created_at: noon(recent_day))
      add_message(chat, kind: :automation, at: noon(recent_day))
      2.times { add_message(chat, kind: :automation, at: noon(recent_day), is_span: true) }

      expect(digest.call[recent_day]).to include(messages_sent_by_automation: 1)
    end

    it "considera mensagens com active nil" do
      chat = add_chat(created_at: noon(recent_day))
      add_message(chat, kind: :automation, at: noon(recent_day), active: nil)

      expect(digest.call[recent_day]).to include(messages_sent_by_automation: 1)
    end

    it "conta transbordo humano uma vez por conversa, e separa a resolvida só pela automação" do
      touched = add_chat(created_at: noon(recent_day))
      add_message(touched, kind: :inbound, at: noon(recent_day))
      2.times { add_message(touched, kind: :human, at: noon(recent_day) + 1.minute) }

      automated = add_chat(created_at: noon(recent_day))
      add_message(automated, kind: :inbound, at: noon(recent_day))
      add_message(automated, kind: :automation, at: noon(recent_day) + 1.minute)

      expect(digest.call[recent_day]).to include(chats_with_human_touch: 1, chats_handled_by_automation: 1)
    end

    it "classifica como humana a resposta com account_id, mesmo com role assistant" do
      chat = add_chat(created_at: noon(recent_day))
      add_message(chat, kind: :inbound, at: noon(recent_day))
      add_message(chat, kind: :human, at: noon(recent_day) + 2.minutes)

      expect(digest.call[recent_day]).to include(
        first_response_human_seconds_sum: 120.0,
        first_response_human_count: 1,
        first_response_automation_count: 0
      )
    end

    it "agrupa os canais por dia e deriva as conversas iniciadas" do
      add_chat(created_at: noon(recent_day), audience_type: "whatsapp_api")
      add_chat(created_at: noon(recent_day), audience_type: "instagram")
      add_chat(created_at: noon(old_day), audience_type: "web")

      result = digest.call

      expect(result[recent_day]).to include(chats_by_channel: { "whatsapp_api" => 1, "instagram" => 1 }, chats_started: 2)
      expect(result[old_day]).to include(chats_by_channel: { "web" => 1 }, chats_started: 1)
    end

    it "calcula horas economizadas por dia" do
      chat = add_chat(created_at: noon(recent_day))
      10.times { add_message(chat, kind: :automation, at: noon(recent_day)) }

      expect(digest.call[recent_day]).to include(hours_saved: 0.35, messages_avoided: 10)
    end

    it "conta os agendamentos criados sem pessoa, por dia" do
      calendar = create(:agenda_calendar, organization: organization)
      create(:agenda_booking, calendar: calendar, created_at: noon(recent_day))
      create(:agenda_booking, calendar: calendar, created_at: noon(recent_day), event_user_name: "Marina")

      expect(digest.call[recent_day]).to include(automation_bookings: 1)
    end

    it "traz as mesmas chaves que o digest diário" do
      chat = add_chat(created_at: noon(recent_day))
      add_message(chat, kind: :automation, at: noon(recent_day))

      expect(digest.call[recent_day].except(:hourly).keys).to match_array(Insights::OperationalDailyDigest::ALL_KEYS)
    end

    it "ignora conversas de outra organização" do
      other = create(:chat, organization: create(:organization), created_at: noon(recent_day), last_message_at: noon(recent_day))
      add_message(other, kind: :automation, at: noon(recent_day))

      expect(digest.call).to be_empty
    end

    it "devolve vazio quando não há atividade" do
      expect(digest.call).to be_empty
    end

    it "não cria linha para dia sem atividade" do
      chat = add_chat(created_at: noon(recent_day))
      add_message(chat, kind: :automation, at: noon(recent_day))

      expect(digest.call.keys).to eq([ recent_day ])
    end
  end
end
