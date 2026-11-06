require "rails_helper"

RSpec.describe Insights::FirstResponseDaily do
  subject(:service) { described_class.new(organization_id: organization.id, range: range) }

  let(:organization) { create(:organization) }
  let(:zone) { ActiveSupport::TimeZone["America/Sao_Paulo"] }
  let(:day) { zone.today }
  let(:range) { day_range(day, zone) }
  let(:noon) { range.first + 12.hours }

  def add_chat(created_at: noon, target: organization)
    create(:chat, organization: target, created_at: created_at)
  end

  describe "tempo de primeira resposta" do
    it "mede o delta entre a 1ª mensagem do contato e a 1ª resposta da automação" do
      chat = add_chat
      add_message(chat, at: noon, kind: :inbound)
      add_message(chat, at: noon + 30.seconds, kind: :automation)

      expect(service.to_h).to include(
        first_response_automation_seconds_sum: 30.0,
        first_response_automation_count: 1,
        first_response_human_count: 0
      )
    end

    it "classifica como humana a resposta com account_id, mesmo com role assistant" do
      chat = add_chat
      add_message(chat, at: noon, kind: :inbound)
      add_message(chat, at: noon + 5.minutes, kind: :human)

      expect(service.to_h).to include(
        first_response_human_seconds_sum: 300.0,
        first_response_human_count: 1,
        first_response_automation_count: 0
      )
    end

    it "classifica como humana a resposta que saiu do próprio celular" do
      chat = add_chat
      add_message(chat, at: noon, kind: :inbound)
      add_message(chat, at: noon + 1.minute, kind: :phone)

      expect(service.to_h).to include(first_response_human_seconds_sum: 60.0, first_response_human_count: 1)
    end

    it "campanha não é resposta" do
      chat = add_chat
      add_message(chat, at: noon, kind: :inbound)
      add_message(chat, at: noon + 10.seconds, kind: :campaign)
      add_message(chat, at: noon + 40.seconds, kind: :automation)

      expect(service.to_h).to include(first_response_automation_seconds_sum: 40.0, first_response_automation_count: 1)
    end

    it "usa apenas a primeira resposta posterior à primeira mensagem do contato" do
      chat = add_chat
      add_message(chat, at: noon, kind: :inbound)
      add_message(chat, at: noon + 10.seconds, kind: :automation)
      add_message(chat, at: noon + 90.seconds, kind: :automation)

      expect(service.to_h).to include(first_response_automation_seconds_sum: 10.0, first_response_automation_count: 1)
    end

    it "ignora saídas anteriores à primeira mensagem do contato" do
      chat = add_chat
      add_message(chat, at: noon, kind: :automation)
      add_message(chat, at: noon + 1.minute, kind: :inbound)
      add_message(chat, at: noon + 2.minutes, kind: :automation)

      expect(service.to_h).to include(first_response_automation_seconds_sum: 60.0, first_response_automation_count: 1)
    end

    it "captura resposta que chegou depois da meia-noite (RESPONSE_LOOKAHEAD)" do
      late = range.first + 23.hours + 50.minutes
      chat = add_chat(created_at: late)
      add_message(chat, at: late, kind: :inbound)
      add_message(chat, at: range.last + 10.minutes, kind: :automation)

      expect(service.to_h).to include(first_response_automation_seconds_sum: 1200.0, first_response_automation_count: 1)
    end

    it "não conta conversa sem resposta" do
      chat = add_chat
      add_message(chat, at: noon, kind: :inbound)

      expect(service.to_h).to include(first_response_automation_count: 0, first_response_human_count: 0)
    end

    it "ignora spans, que duplicariam a mesma mensagem" do
      chat = add_chat
      add_message(chat, at: noon, kind: :inbound)
      add_message(chat, at: noon + 2.seconds, kind: :automation, is_span: true)
      add_message(chat, at: noon + 20.seconds, kind: :automation)

      expect(service.to_h).to include(first_response_automation_seconds_sum: 20.0, first_response_automation_count: 1)
    end

    it "considera mensagens com active nil" do
      chat = add_chat
      add_message(chat, at: noon, kind: :inbound, active: nil)
      add_message(chat, at: noon + 15.seconds, kind: :automation, active: nil)

      expect(service.to_h).to include(first_response_automation_count: 1)
    end

    it "ignora conversas de outra organização" do
      other = add_chat(target: create(:organization))
      add_message(other, at: noon, kind: :inbound)
      add_message(other, at: noon + 10.seconds, kind: :automation)

      expect(service.to_h).to include(first_response_automation_count: 0)
    end

    it "ignora conversas criadas fora do dia" do
      chat = add_chat(created_at: range.first - 2.hours)
      add_message(chat, at: noon, kind: :inbound)
      add_message(chat, at: noon + 10.seconds, kind: :automation)

      expect(service.to_h).to include(first_response_automation_count: 0)
    end

    it "soma várias conversas, para o dashboard fazer a média ponderada" do
      first = add_chat
      add_message(first, at: noon, kind: :inbound)
      add_message(first, at: noon + 10.seconds, kind: :automation)

      second = add_chat
      add_message(second, at: noon, kind: :inbound)
      add_message(second, at: noon + 50.seconds, kind: :automation)

      expect(service.to_h).to include(first_response_automation_seconds_sum: 60.0, first_response_automation_count: 2)
    end

    it "soma os lotes quando há mais conversas que o tamanho do lote" do
      stub_const("#{described_class}::CHUNK_SIZE", 1)
      2.times do
        chat = add_chat
        add_message(chat, at: noon, kind: :inbound)
        add_message(chat, at: noon + 10.seconds, kind: :automation)
      end

      expect(service.to_h).to include(first_response_automation_seconds_sum: 20.0, first_response_automation_count: 2)
    end
  end

  describe "transbordo humano" do
    it "conta a conversa que teve ao menos uma mensagem de pessoa" do
      chat = add_chat
      add_message(chat, at: noon, kind: :inbound)
      add_message(chat, at: noon + 10.seconds, kind: :automation)
      add_message(chat, at: noon + 5.minutes, kind: :human)

      expect(service.to_h).to include(chats_with_human_touch: 1)
    end

    it "conta cada conversa uma única vez" do
      chat = add_chat
      add_message(chat, at: noon, kind: :inbound)
      add_message(chat, at: noon + 1.minute, kind: :human)
      add_message(chat, at: noon + 2.minutes, kind: :human)

      expect(service.to_h).to include(chats_with_human_touch: 1)
    end

    it "não conta conversa atendida só pela automação" do
      chat = add_chat
      add_message(chat, at: noon, kind: :inbound)
      add_message(chat, at: noon + 10.seconds, kind: :automation)

      expect(service.to_h).to include(chats_with_human_touch: 0)
    end
  end

  describe "resolvidas só pela automação" do
    it "conta a conversa com automação e sem pessoa" do
      chat = add_chat
      add_message(chat, at: noon, kind: :inbound)
      add_message(chat, at: noon + 10.seconds, kind: :automation)

      expect(service.to_h).to include(chats_handled_by_automation: 1)
    end

    it "não conta a que teve pessoa, nem a que ninguém respondeu" do
      with_person = add_chat
      add_message(with_person, at: noon, kind: :inbound)
      add_message(with_person, at: noon + 10.seconds, kind: :automation)
      add_message(with_person, at: noon + 1.minute, kind: :human)

      unanswered = add_chat
      add_message(unanswered, at: noon, kind: :inbound)

      expect(service.to_h).to include(chats_handled_by_automation: 0)
    end
  end

  it "sem dados, devolve zeros" do
    expect(service.to_h).to eq(
      first_response_automation_seconds_sum: 0.0,
      first_response_automation_count: 0,
      first_response_human_seconds_sum: 0.0,
      first_response_human_count: 0,
      chats_with_human_touch: 0,
      chats_handled_by_automation: 0
    )
  end
end
