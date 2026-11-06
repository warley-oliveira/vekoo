require "rails_helper"

# Freio para contato que manda mensagem demais. O caminho dentro de `Chats::InboundFlow` está em
# inbound_flow_spec.rb; aqui, a regra da contagem e das advertências.
RSpec.describe Chats::InboundThrottle do
  include ActiveSupport::Testing::TimeHelpers
  include InboundHelpers

  let(:chat) { create(:chat, automation_enabled: true) }
  let(:limiter) { described_class.new(chat) }

  def in_production
    allow(Rails.env).to receive(:production?).and_return(true)
  end

  describe "#red_flagged?" do
    it "abaixo do limite não faz nada" do
      chat.set(red_flag_count: 4)

      expect(limiter.red_flagged?).to be(false)
      expect(chat.reload.automation_enabled).to be(true)
      expect(notes_of(chat).count).to eq(0)
    end

    context "no limite" do
      before { chat.set(red_flag_count: 5) }

      it "desliga a automação com a nota de cota" do
        expect(limiter.red_flagged?).to be(true)

        expect(chat.reload.automation_enabled).to be(false)
        expect(notes_of(chat, "automation-stopped").take.content).to eq("Automação desativada para esse contato. Cota de advertências atingida.")
      end

      it "não deixa outra nota de pausa além dessa" do
        limiter.red_flagged?

        expect(notes_of(chat, "automation-toggle-notation").count).to eq(0)
      end

      it "com a automação já desligada, só responde que sim" do
        chat.set(automation_enabled: false)

        expect(limiter.red_flagged?).to be(true)
        expect(notes_of(chat).count).to eq(0)
      end
    end
  end

  describe "#delay" do
    it "fora de produção, rajada nunca espera" do
      (described_class::RATE_LIMIT + 5).times { expect(limiter.delay).to be_nil }

      expect(chat.reload.red_flag_count).to eq(0)
    end

    context "em produção" do
      before { in_production }

      it "abaixo do limite não espera, e conta" do
        expect(limiter.delay).to be_nil
        expect(limiter.delay).to be_nil

        expect(Rails.cache.read(described_class.counter_key(chat))).to eq(2)
      end

      it "até o limite não espera" do
        described_class::RATE_LIMIT.times { expect(limiter.delay).to be_nil }
      end

      it "passando do limite espera 10 minutos, com nota e advertência" do
        described_class::RATE_LIMIT.times { limiter.delay }

        expect(limiter.delay).to eq(10.minutes)
        expect(chat.reload.red_flag_count).to eq(1)
        expect(notes_of(chat, "automation-stopped").take.content).to include("10 minutos")
      end

      it "a contagem por conversa é independente" do
        described_class::RATE_LIMIT.times { limiter.delay }

        expect(described_class.new(create(:chat)).delay).to be_nil
      end

      it "a janela acaba 4 minutos depois da primeira mensagem" do
        start = Time.current
        travel_to(start) { described_class::RATE_LIMIT.times { limiter.delay } }

        travel_to(start + described_class::PERIOD + 1.second) do
          expect(limiter.delay).to be_nil
          expect(Rails.cache.read(described_class.counter_key(chat))).to eq(1)
        end
      end

      # A janela é fixa, como na origem. Se cada mensagem renovasse o prazo do contador, quem
      # manda uma mensagem a cada 3 minutos nunca zeraria e acabaria freado sem ter feito rajada.
      it "mensagens espaçadas não acumulam entre janelas" do
        start = Time.current

        (described_class::RATE_LIMIT * 2).times do |index|
          travel_to(start + (index * 3).minutes) { expect(limiter.delay).to be_nil }
        end

        expect(chat.reload.red_flag_count).to eq(0)
      end
    end
  end

  describe ".reset" do
    before { in_production }

    it "zera a contagem" do
      described_class::RATE_LIMIT.times { limiter.delay }

      described_class.reset(chat)

      expect(limiter.delay).to be_nil
      expect(Rails.cache.read(described_class.counter_key(chat))).to eq(1)
    end

    it "abre uma janela nova" do
      start = Time.current
      travel_to(start) { limiter.delay }

      travel_to(start + 3.minutes) do
        described_class.reset(chat)
        limiter.delay
      end

      travel_to(start + 5.minutes) { expect(Rails.cache.read(described_class.counter_key(chat))).to eq(1) }
    end
  end
end
