# frozen_string_literal: true

require "rails_helper"

RSpec.describe MiniRacerEngine::Budget do
  let(:limits) { MiniRacerEngine::Limits }

  describe "prazo" do
    it "usa o padrão e não passa do teto" do
      expect(described_class.new.timeout_ms).to eq(limits::DEFAULT_TIMEOUT_MS)
      expect(described_class.new(timeout_ms: 0).timeout_ms).to eq(limits::DEFAULT_TIMEOUT_MS)
      expect(described_class.new(timeout_ms: -5).timeout_ms).to eq(limits::DEFAULT_TIMEOUT_MS)
      expect(described_class.new(timeout_ms: 2_000).timeout_ms).to eq(2_000)
      expect(described_class.new(timeout_ms: 10**9).timeout_ms).to eq(limits::MAX_TIMEOUT_MS)
    end

    it "conta o que falta e não fica negativo" do
      budget = described_class.new(timeout_ms: 20)

      expect(budget.remaining_seconds).to be_between(0, 0.02)
      expect(budget).not_to be_expired

      sleep 0.03

      expect(budget.remaining_seconds).to eq(0)
      expect(budget).to be_expired
    end
  end

  describe "cotas" do
    subject(:budget) { described_class.new }

    it "chamadas" do
      stub_const("MiniRacerEngine::Limits::MAX_CALLS", 2)

      2.times { budget.charge_call! }
      expect { budget.charge_call!(:add_tag) }.to raise_error(MiniRacerEngine::LimitExceeded, /2 calls.*add_tag/)
    end

    it "rede" do
      stub_const("MiniRacerEngine::Limits::MAX_FETCHES", 1)

      budget.charge_fetch!
      expect { budget.charge_fetch! }.to raise_error(MiniRacerEngine::LimitExceeded, /1 network calls/)
    end

    it "bytes de resposta: cada uma tem teto, e a soma também" do
      expect(budget.response_bytes_left).to eq(limits::MAX_RESPONSE_BYTES)

      budget.charge_response_bytes!(limits::MAX_TOTAL_RESPONSE_BYTES - 1.kilobyte)

      expect(budget.response_bytes_left).to eq(1.kilobyte)
    end

    it "bytes gravados" do
      stub_const("MiniRacerEngine::Limits::MAX_STORED_BYTES", 10)

      budget.charge_stored_bytes!(10)
      expect { budget.charge_stored_bytes!(1) }.to raise_error(MiniRacerEngine::LimitExceeded, /stored bytes/)
    end

    it "linhas de log não levantam: só param de contar" do
      stub_const("MiniRacerEngine::Limits::MAX_CONSOLE_LINES", 1)

      expect(budget.charge_console_line).to be(true)
      expect(budget.charge_console_line).to be(false)
    end

    it "a mensagem chega ao JS: só ASCII" do
      budget = described_class.new
      stub_const("MiniRacerEngine::Limits::MAX_FETCHES", 0)

      expect { budget.charge_fetch! }.to raise_error(MiniRacerEngine::LimitExceeded) { |error|
        expect(error.message).to be_ascii_only
      }
    end
  end
end
