require "rails_helper"

RSpec.describe WabaErrorHandler do
  describe ".humanize" do
    it "traduz o código conhecido" do
      expect(described_class.humanize(131_047)).to start_with("Fora da janela de 24 horas")
    end

    it "aceita o código como texto: é assim que ele vem no webhook" do
      expect(described_class.humanize("131047")).to start_with("Fora da janela de 24 horas")
    end

    it "acrescenta o detalhe da Meta quando há" do
      expect(described_class.humanize(190, "Token expirou")).to eq(
        "O Access Token da Meta expirou ou é inválido. É necessário gerar um token novo. | Detalhes da Meta: Token expirou"
      )
    end

    it "ignora detalhe em branco" do
      expect(described_class.humanize(190, "")).not_to include("Detalhes da Meta")
    end

    it "explica o código desconhecido" do
      expect(described_class.humanize(999_999)).to eq("Erro não mapeado (Código: 999999). Verifique a documentação da Meta.")
    end

    it "explica o desconhecido e ainda leva o detalhe" do
      expect(described_class.humanize(999_999, "novo erro")).to include("Código: 999999", "Detalhes da Meta: novo erro")
    end

    # O envio de template trata 132001 como tradução que não existe (ver
    # Connector::WhatsappCloud#send_template_with_language_fallback): a frase precisa bater.
    it "132001 diz que o template não existe naquele idioma" do
      expect(described_class.humanize(132_001)).to include("idioma")
    end

    it "132000 diz que o número de variáveis não bate" do
      expect(described_class.humanize(132_000)).to include("parâmetros")
    end

    it "traz frase para todo código de conta e cobrança" do
      described_class::ACCOUNT_BILLING_CODES.each do |code|
        expect(described_class.humanize(code)).not_to include("Erro não mapeado")
      end
    end
  end

  describe ".retryable?" do
    [ 1, 2, 4, 80_007, 130_429, 131_052, 131_056 ].each do |code|
      it "#{code} vale tentar de novo" do
        expect(described_class.retryable?(code)).to be(true)
      end
    end

    [ 190, 131_047, 132_001, 133_010, 999_999 ].each do |code|
      it "#{code} não muda repetindo" do
        expect(described_class.retryable?(code)).to be(false)
      end
    end

    it "aceita o código como texto" do
      expect(described_class.retryable?("130429")).to be(true)
    end
  end

  describe ".account_billing_error?" do
    [ 190, 368, 131_031, 131_042, 133_010, 131_050, 131_055 ].each do |code|
      it "#{code} é problema de conta ou cobrança" do
        expect(described_class.account_billing_error?(code)).to be(true)
      end
    end

    [ 131_047, 130_429, 132_001, 999_999 ].each do |code|
      it "#{code} não é" do
        expect(described_class.account_billing_error?(code)).to be(false)
      end
    end

    it "aceita o código como texto" do
      expect(described_class.account_billing_error?("133010")).to be(true)
    end
  end
end
