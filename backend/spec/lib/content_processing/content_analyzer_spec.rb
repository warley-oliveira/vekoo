require "rails_helper"

RSpec.describe ContentProcessing::ContentAnalyzer do
  describe ".similarity" do
    it "é 1.0 para textos iguais" do
      expect(described_class.similarity("Tabela de preços", "Tabela de preços")).to eq(1.0)
    end

    it "ignora maiúsculas" do
      expect(described_class.similarity("TABELA", "tabela")).to eq(1.0)
    end

    it "é 0.0 para textos sem pares em comum" do
      expect(described_class.similarity("abcd", "wxyz")).to eq(0.0)
    end

    it "fica alto para nomes quase iguais, como o anexo citado com erro de digitação" do
      expect(described_class.similarity("catalogo_verao", "catalogo_verao_2026")).to be > 0.8
    end

    it "não quebra com texto vazio ou de uma letra" do
      expect(described_class.similarity("", "a")).to eq(0.0)
      expect(described_class.similarity(nil, "")).to eq(0.0)
    end
  end

  describe "#last_three_user_contents_similar?" do
    it "só vale com três mensagens do contato parecidas" do
      messages = [ { role: "user", content: "oi" }, { role: "assistant", content: "x" }, { role: "user", content: "oi" }, { role: "user", content: "oi" } ]

      expect(described_class.new(messages)).to be_last_three_user_contents_similar
      expect(described_class.new(messages.first(2))).not_to be_last_three_user_contents_similar
    end
  end
end
