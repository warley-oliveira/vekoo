module Ai
  # A porta para o modelo. É o **único** lugar do projeto que conhece o SDK da
  # Anthropic — por isso é também a costura por onde os testes entram, sem
  # tocar a rede.
  class Chat
    # `::Anthropic` com os dois-pontos em todo lugar: dentro de `module Ai` o
    # Ruby procuraria `Ai::Chat::Anthropic` primeiro e levantaria NameError na
    # hora de casar o `rescue` — mascarando o erro de verdade.
    MODEL = :"claude-opus-5"

    # Sem chave o produto não quebra: o endpoint responde `failed`, registra o
    # motivo e **não cobra crédito**. Melhor do que um 500 sem explicação.
    class MissingKey < StandardError; end

    # Falha vinda do modelo ou da rede. Quem chama traduz para `failed`.
    class Failed < StandardError; end

    def self.available? = ENV["ANTHROPIC_API_KEY"].present?

    def initialize(client: nil)
      @client = client
    end

    # Texto em pedaços, como o modelo escreve.
    def stream_text(system:, prompt:, max_tokens: 2_000, effort: "low")
      stream = client.messages.stream(
        model: MODEL,
        max_tokens: max_tokens,
        system_: [ { type: "text", text: system, cache_control: { type: "ephemeral" } } ],
        # No Opus 5 o pensamento já vem ligado; declarar deixa explícito e
        # protege de mudança de padrão. `budget_tokens` foi removido e dá 400.
        thinking: { type: "adaptive" },
        output_config: { effort: effort },
        messages: [ { role: "user", content: prompt } ]
      )

      stream.text.each { |piece| yield piece }
    rescue ::Anthropic::Errors::APIStatusError => e
      raise Failed, "#{e.class.name.demodulize}: #{e.type}"
    rescue ::Anthropic::Errors::APIConnectionError => e
      raise Failed, e.class.name.demodulize
    end

    # Uma resposta só, para quando não há o que mostrar em pedaços.
    def complete(system:, prompt:, max_tokens: 1_000, effort: "low")
      message = client.messages.create(
        model: MODEL,
        max_tokens: max_tokens,
        system_: [ { type: "text", text: system, cache_control: { type: "ephemeral" } } ],
        thinking: { type: "adaptive" },
        output_config: { effort: effort },
        messages: [ { role: "user", content: prompt } ]
      )

      # Classificadores podem recusar o pedido: HTTP 200, `stop_reason` de
      # recusa e nenhum texto útil. Checar antes de ler o conteúdo.
      raise Failed, "refusal" if message.stop_reason == :refusal

      message.content.filter_map { |block| block.text if block.type == :text }.join
    rescue ::Anthropic::Errors::APIStatusError => e
      raise Failed, "#{e.class.name.demodulize}: #{e.type}"
    rescue ::Anthropic::Errors::APIConnectionError => e
      raise Failed, e.class.name.demodulize
    end

    private

    # A chave só é exigida quando há um cliente para construir: quem injeta o
    # seu (os testes, e amanhã um outro transporte) não precisa dela.
    def client
      @client ||= begin
        raise MissingKey unless self.class.available?

        ::Anthropic::Client.new(
          api_key: ENV.fetch("ANTHROPIC_API_KEY"),
          timeout: 120,
          # Um retry do SDK reiniciaria o stream do zero e o cliente receberia
          # o começo duas vezes. Retentar é decisão de quem chama.
          max_retries: 0
        )
      end
    end
  end
end
