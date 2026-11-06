require "rails_helper"

RSpec.describe Insights::MessageVolumeDaily do
  include ActiveSupport::Testing::TimeHelpers

  subject(:service) { described_class.new(organization_id: organization.id, range: range, zone: zone) }

  let(:organization) { create(:organization) }
  let(:zone) { ActiveSupport::TimeZone["America/Sao_Paulo"] }
  let(:day) { zone.today }
  let(:range) { day_range(day, zone) }
  let(:noon) { range.first + 12.hours }

  def add_chat(created_at: noon, last_message_at: noon, target: organization)
    create(:chat, organization: target, created_at: created_at, last_message_at: last_message_at)
  end

  describe "totais" do
    it "separa recebidas, automação, campanha e pessoa" do
      chat = add_chat
      2.times { add_message(chat, kind: :inbound, at: noon) }
      3.times { add_message(chat, kind: :automation, at: noon) }
      add_message(chat, kind: :human, at: noon)
      add_message(chat, kind: :campaign, at: noon)

      expect(service.to_h).to include(
        messages_inbound: 2,
        messages_sent_by_automation: 3,
        messages_sent_by_human: 1,
        messages_sent_by_campaign: 1
      )
    end

    it "conta como pessoa o que saiu do próprio celular, sem pôr no ranking" do
      chat = add_chat
      add_message(chat, kind: :phone, at: noon)

      expect(service.to_h).to include(messages_sent_by_human: 1, messages_sent_by_automation: 0, messages_by_account: {})
    end

    it "conta mensagens de conversas antigas: uma conversa de 90 dias que falou hoje conta hoje" do
      chat = add_chat(created_at: range.first - 90.days)
      add_message(chat, kind: :inbound, at: noon)
      add_message(chat, kind: :automation, at: noon)

      expect(service.to_h).to include(messages_inbound: 1, messages_sent_by_automation: 1)
    end

    it "ignora spans, que contariam a mesma mensagem mais de uma vez" do
      chat = add_chat
      add_message(chat, kind: :automation, at: noon)
      2.times { add_message(chat, kind: :automation, at: noon, is_span: true) }

      expect(service.to_h).to include(messages_sent_by_automation: 1)
    end

    it "considera mensagens com active nil" do
      chat = add_chat
      add_message(chat, kind: :automation, at: noon, active: nil)

      expect(service.to_h).to include(messages_sent_by_automation: 1)
    end

    # O `before_create` do modelo troca `false` por `true`: inativa só existe depois de limpar o contexto.
    it "não conta mensagem inativa" do
      chat = add_chat
      add_message(chat, kind: :automation, at: noon)
      ChatMessage::Base.unscoped.where(chat_id: chat.id).update_all(active: false)

      expect(service.to_h).to include(messages_sent_by_automation: 0)
    end

    it "não conta chamada de ferramenta dos blocos de IA" do
      chat = add_chat
      add_message(chat, kind: :automation, at: noon, tool_calls: [ { "id" => "1" } ])

      expect(service.to_h).to include(messages_sent_by_automation: 0)
    end

    it "ignora mensagens fora do dia" do
      chat = add_chat
      add_message(chat, kind: :automation, at: range.first - 1.hour)
      add_message(chat, kind: :automation, at: noon)

      expect(service.to_h).to include(messages_sent_by_automation: 1)
    end

    it "ignora conversas de outra organização" do
      add_message(add_chat(target: create(:organization)), kind: :automation, at: noon)

      expect(service.to_h).to include(messages_sent_by_automation: 0)
    end

    it "ignora a conversa de teste" do
      chat = create(:chat, organization: organization, external_id: Chat::TEST_EXTERNAL_ID, created_at: noon, last_message_at: noon)
      add_message(chat, kind: :automation, at: noon)

      expect(service.to_h).to include(messages_sent_by_automation: 0)
    end

    it "não classifica bolhas de widget como automação nem como pessoa" do
      chat = add_chat
      add_message(chat, kind: :automation, at: noon, message_origin: "widget_proactive")

      expect(service.to_h).to include(messages_inbound: 0, messages_sent_by_automation: 0, messages_sent_by_human: 0)
    end
  end

  describe "fora do horário" do
    let(:weekday) { zone.local(2026, 11, 4) } # quarta-feira
    let(:day) { Date.new(2026, 11, 4) }

    before { travel_to(weekday + 20.hours) }
    after { travel_back }

    it "conta a mensagem da automação antes das 8h e depois das 18h, no fuso da organização" do
      chat = add_chat(created_at: weekday, last_message_at: weekday + 19.hours)
      add_message(chat, kind: :automation, at: weekday + 7.hours)
      add_message(chat, kind: :automation, at: weekday + 10.hours)
      add_message(chat, kind: :automation, at: weekday + 19.hours)
      add_message(chat, kind: :human, at: weekday + 19.hours)

      expect(service.to_h).to include(messages_sent_by_automation: 3, out_of_hours_messages: 2)
    end

    it "conta o fim de semana inteiro" do
      saturday = zone.local(2026, 11, 7)
      travel_to(saturday + 13.hours)
      chat = add_chat(created_at: saturday, last_message_at: saturday + 10.hours)
      add_message(chat, kind: :automation, at: saturday + 10.hours)

      result = described_class.new(organization_id: organization.id, range: day_range(saturday.to_date, zone), zone: zone).to_h

      expect(result[:out_of_hours_messages]).to eq(1)
    end
  end

  describe "ranking de quem atende" do
    it "agrupa por account_id, da maior para a menor" do
      chat = add_chat
      3.times { add_message(chat, kind: :human, at: noon, account_id: "conta-7") }
      add_message(chat, kind: :human, at: noon, account_id: "conta-9")

      expect(service.to_h[:messages_by_account]).to eq("conta-7" => 3, "conta-9" => 1)
    end

    it "guarda só o teto do ranking" do
      stub_const("#{described_class}::ACCOUNT_RANKING_LIMIT", 1)
      chat = add_chat
      2.times { add_message(chat, kind: :human, at: noon, account_id: "conta-7") }
      add_message(chat, kind: :human, at: noon, account_id: "conta-9")

      expect(service.to_h[:messages_by_account]).to eq("conta-7" => 2)
    end
  end

  describe "conversas" do
    it "conta cada conversa ativa uma vez" do
      chat = add_chat
      3.times { add_message(chat, kind: :inbound, at: noon) }
      add_message(add_chat, kind: :inbound, at: noon)

      expect(service.to_h[:active_chats]).to eq(2)
    end

    it "conta as atendidas pela automação, sem campanha" do
      answered = add_chat
      2.times { add_message(answered, kind: :automation, at: noon) }
      add_message(add_chat, kind: :campaign, at: noon)
      add_message(add_chat, kind: :human, at: noon)

      expect(service.to_h).to include(active_chats: 3, automation_chats: 1)
    end
  end

  describe "por hora" do
    it "distribui pela hora local, não pela do servidor" do
      chat = add_chat
      add_message(chat, kind: :inbound, at: range.first + 9.hours)
      add_message(chat, kind: :inbound, at: range.first + 9.hours + 30.minutes)
      add_message(chat, kind: :inbound, at: range.first + 22.hours)

      expect(service.to_h[:hourly]).to eq("9" => 2, "22" => 1)
    end
  end

  describe ".stale?" do
    it "é falso para o dia corrente" do
      expect(described_class.stale?(range)).to be(false)
    end

    it "é verdadeiro para dia histórico" do
      expect(described_class.stale?(day_range(day - 30.days, zone))).to be(true)
    end

    it "devolve resultado vazio em vez de número errado quando o dia é antigo" do
      old_range = day_range(day - 30.days, zone)
      chat = add_chat(created_at: old_range.first, last_message_at: noon)
      add_message(chat, kind: :automation, at: old_range.first + 12.hours)

      result = described_class.new(organization_id: organization.id, range: old_range, zone: zone).to_h

      expect(result).to eq(described_class.blank_result)
    end
  end

  it "sem dados, devolve zeros e hashes vazios" do
    expect(service.to_h).to eq(described_class.blank_result)
  end
end
