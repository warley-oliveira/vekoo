require "rails_helper"

# Freio para contato que acumulou advertências. O caminho dentro de `Chats::InboundFlow` está em
# inbound_flow_spec.rb; aqui, a regra.
RSpec.describe Chats::InboundThrottle do
  include InboundHelpers

  let(:chat) { create(:chat, automation_enabled: true) }
  let(:limiter) { described_class.new(chat) }

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
end
