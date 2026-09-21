module Agent
  # O teto de OPEX: quanto a organização pode gastar de modelo por mês.
  #
  # É um controle da Vekoo, não do cliente — o cliente vê créditos. Os dois
  # existem porque medem coisas diferentes: crédito é preço de venda, custo é
  # o que a Anthropic cobra. Um plano generoso demais quebra pelo segundo,
  # nunca pelo primeiro.
  module Budget
    class CapReached < StandardError; end

    module_function

    # Zero (ou ausente) desliga o teto — é o padrão em desenvolvimento.
    def cap_cents
      ENV.fetch("AGENT_MONTHLY_COST_CENTS_CAP", "0").to_i
    end

    def enabled? = cap_cents.positive?

    def period_start
      Time.current.beginning_of_month
    end

    def spent_cents(organization)
      Pricing.micro_usd_to_cents(
        AgentTurn.cost_micro_usd_since(organization, period_start)
      )
    end

    def check!(organization)
      return true unless enabled?
      raise CapReached if spent_cents(organization) >= cap_cents

      true
    end

    # O que a tela mostra em "Configurações" um dia; hoje serve ao log e ao
    # erro, que precisa dizer quanto falta para virar o mês.
    def as_json(organization)
      {
        capCents: cap_cents,
        spentCents: spent_cents(organization).round(2),
        periodStart: (period_start.to_f * 1000).round,
        enabled: enabled?
      }
    end
  end
end
