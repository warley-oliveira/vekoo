module Agent
  # O preço do modelo, em um lugar só.
  #
  # Guardar o custo por geração não é contabilidade por gosto: é o que permite
  # dizer "esta marca gastou X este mês" antes de a fatura chegar, e é a base
  # do teto de OPEX e do limite por plano. Em milionésimos de dólar (inteiro)
  # porque somar centavos de ponto flutuante em cima de milhares de linhas
  # erra — e erra para menos.
  module Pricing
    # US$ por milhão de tokens. Tabela da Anthropic (platform.claude.com/pricing).
    PRICES = {
      "claude-opus-5" => { input: 5.0, output: 25.0 },
      "claude-opus-4-8" => { input: 5.0, output: 25.0 },
      "claude-opus-4-7" => { input: 5.0, output: 25.0 },
      "claude-sonnet-5" => { input: 2.0, output: 10.0 },
      "claude-haiku-4-5" => { input: 1.0, output: 5.0 }
    }.freeze

    # Escrever no cache custa 1,25× a entrada; ler de lá, 0,1×. É por isso que
    # o prompt do agente foi montado com o bloco estável na frente.
    CACHE_WRITE_MULTIPLIER = 1.25
    CACHE_READ_MULTIPLIER = 0.10

    # Modelo desconhecido (um id novo no `.env`) não zera a conta: cobra como
    # o mais caro que conhecemos, para o teto errar para o lado seguro.
    FALLBACK = { input: 5.0, output: 25.0 }.freeze

    MILLION = 1_000_000.0

    module_function

    def price(model)
      PRICES.fetch(model.to_s, FALLBACK)
    end

    # `usage` é o hash normalizado de `Ai::Chat` (chaves em símbolo).
    def micro_usd(model, usage)
      p = price(model)
      usd =
        (usage[:input].to_i * p[:input] +
         usage[:cacheWrite].to_i * p[:input] * CACHE_WRITE_MULTIPLIER +
         usage[:cacheRead].to_i * p[:input] * CACHE_READ_MULTIPLIER +
         usage[:output].to_i * p[:output]) / MILLION

      (usd * 1_000_000).round
    end

    def micro_usd_to_cents(micro_usd)
      micro_usd.to_i / 10_000.0
    end
  end
end
