require "rails_helper"

# O custo é o número que decide plano e limite. Errar para menos aqui é
# descobrir o problema na fatura.
RSpec.describe Agent::Pricing do
  it "cobra entrada, saída e cache com preços diferentes" do
    usage = { input: 1_000, output: 2_000, cacheRead: 10_000, cacheWrite: 4_000 }

    # 1000×5 + 4000×5×1,25 + 10000×5×0,1 + 2000×25 = 85.000 milionésimos.
    expect(described_class.micro_usd("claude-opus-5", usage)).to eq(85_000)
  end

  it "leitura de cache custa um décimo da entrada — é o que paga o prompt em blocos" do
    cold = described_class.micro_usd("claude-opus-5", { input: 10_000, output: 0, cacheRead: 0, cacheWrite: 0 })
    warm = described_class.micro_usd("claude-opus-5", { input: 0, output: 0, cacheRead: 10_000, cacheWrite: 0 })

    expect(warm).to eq(cold / 10)
  end

  it "cobra os modelos 5.5 pelo preço deles, com a leitura de cache própria do Opus 5.5" do
    usage = { input: 1_000_000, output: 100_000, cacheRead: 1_000_000, cacheWrite: 0 }

    # 4 + 2 (saída) + 0,20 (cache)
    expect(described_class.micro_usd("claude-opus-5-5", usage)).to eq(6_200_000)
    # 2 + 1 + 0,20 (0,1× da entrada)
    expect(described_class.micro_usd("claude-sonnet-5-5", usage)).to eq(3_200_000)
  end

  it "acha o preço do id com data de snapshot" do
    expect(described_class.price("claude-opus-5-20260401")).to eq(described_class.price("claude-opus-5"))
  end

  it "cobra modelo desconhecido como o mais caro, para o teto errar para o lado seguro" do
    usage = { input: 1_000, output: 0, cacheRead: 0, cacheWrite: 0 }

    expect(described_class.micro_usd("claude-modelo-do-futuro", usage))
      .to eq(described_class.micro_usd("claude-opus-5", usage))
  end

  it "converte para centavos sem perder a casa" do
    expect(described_class.micro_usd_to_cents(85_000)).to eq(8.5)
  end
end
