# frozen_string_literal: true

require "rails_helper"

RSpec.describe CustomAttributes::ValueNormalizer do
  describe ".normalize" do
    it "usa o menor valor da faixa por padrão" do
      expect(described_class.normalize("20 a 40/dia")).to eq("20")
    end

    it "respeita as estratégias avg e max" do
      expect(described_class.normalize("20 a 40/dia", strategy: "avg")).to eq("30")
      expect(described_class.normalize("20 a 40/dia", strategy: "max")).to eq("40")
    end

    it "trata hífen como separador de faixa (números sempre positivos)" do
      expect(described_class.normalize("1-2")).to eq("1")
    end

    it "entende milhar e decimal pt-BR" do
      expect(described_class.normalize("R$ 50.000,00/mês")).to eq("50000")
      expect(described_class.normalize("15,5")).to eq("15.5")
    end

    it "é idempotente para valores já canônicos" do
      expect(described_class.normalize("30")).to eq("30")
    end

    it "retorna nil quando não há número extraível" do
      expect(described_class.normalize("sem numero")).to be_nil
      expect(described_class.normalize("")).to be_nil
    end
  end
end
