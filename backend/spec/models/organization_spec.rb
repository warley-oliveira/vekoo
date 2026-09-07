require "rails_helper"

# Créditos são o caminho do dinheiro: é o único lugar do domínio onde uma
# corrida entre duas requisições vira saldo errado (ou um 500 pela check
# constraint). Por isso este modelo tem spec próprio, enquanto o resto do
# domínio é coberto por request spec.
RSpec.describe Organization do
  subject(:organization) { create(:organization, credits_total: 50, credits_used: 0) }

  describe "#consume_credits" do
    it "desconta e devolve true quando há saldo" do
      expect(organization.consume_credits(5)).to be(true)
      expect(organization.reload.credits_used).to eq(5)
    end

    it "recusa quando o valor passa do saldo, sem mexer no consumo" do
      organization.update!(credits_used: 48)

      expect(organization.consume_credits(5)).to be(false)
      expect(organization.reload.credits_used).to eq(48)
    end

    it "recusa valores não positivos" do
      expect(organization.consume_credits(0)).to be(false)
      expect(organization.consume_credits(-3)).to be(false)
      expect(organization.reload.credits_used).to be_zero
    end

    it "nunca passa do total quando dois consumos disputam o mesmo saldo" do
      organization.update!(credits_used: 46)

      results = [ organization, Organization.find(organization.id) ].map { |org| org.consume_credits(3) }

      expect(results).to contain_exactly(true, false)
      expect(organization.reload.credits_used).to eq(49)
    end
  end

  describe "#reserve_credits!" do
    it "levanta NoCreditsError em vez de devolver false" do
      organization.update!(credits_used: 50)

      expect { organization.reserve_credits!(1) }.to raise_error(Organization::NoCreditsError)
    end

    it "reserva quando há saldo" do
      expect(organization.reserve_credits!(5)).to be(true)
      expect(organization.reload.credits_left).to eq(45)
    end
  end

  describe "#refund_credits!" do
    it "devolve o que foi reservado" do
      organization.reserve_credits!(5)

      organization.refund_credits!(5)

      expect(organization.reload.credits_used).to be_zero
    end

    it "não deixa o consumo ficar negativo" do
      organization.update!(credits_used: 2)

      organization.refund_credits!(10)

      expect(organization.reload.credits_used).to be_zero
    end

    it "ignora valores não positivos" do
      organization.update!(credits_used: 4)

      expect(organization.refund_credits!(0)).to be(false)
      expect(organization.reload.credits_used).to eq(4)
    end
  end
end
