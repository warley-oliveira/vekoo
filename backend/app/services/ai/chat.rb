module Ai
  # A porta para o modelo. É o **único** lugar do projeto que conhece o SDK da
  # Anthropic — por isso é também a costura por onde os testes entram, sem
  # tocar a rede.
  class Chat
    # `::Anthropic` com os dois-pontos em todo lugar: dentro de `module Ai` o
    # Ruby procuraria `Ai::Chat::Anthropic` primeiro e levantaria NameError na
    # hora de casar o `rescue` — mascarando o erro de verdade.
    # Sonnet 5 por escolha de produto: a geração é curta e frequente, e a
    # diferença de qualidade não paga a de preço aqui. Trocar por
    # `claude-opus-5` é uma linha, se um dia os carrosséis pedirem mais.
    MODEL = :"claude-sonnet-5"

    # Sem chave o produto não quebra: o endpoint responde `failed`, registra o
    # motivo e **não cobra crédito**. Melhor do que um 500 sem explicação.
    class MissingKey < StandardError; end

    # Falha vinda do modelo ou da rede. Quem chama traduz para `failed`.
    class Failed < StandardError; end

    # O que `answer` devolve: o texto e o que ele custou.
    Answer = Struct.new(:text, :usage, :model, keyword_init: true)

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

    # Uma resposta com **a conta junto**: texto, tokens e modelo.
    #
    # Existe separada de `complete` porque o agente de criação precisa saber o
    # que gastou (é dessa soma que sai o teto de OPEX) e porque ele manda o
    # contexto em vários blocos de sistema, com mais de um ponto de cache — o
    # catálogo de motores é igual para todo mundo, a ficha da marca é igual
    # para a marca, e só o pedido muda.
    #
    # `system:` recebe os blocos já prontos (com `cache_control` onde quem
    # chama quiser); `messages:` recebe a conversa inteira.
    def answer(system:, messages:, model: MODEL, max_tokens: 8_000, effort: "medium", schema: nil)
      output_config = { effort: effort }
      # A saída estruturada fica atrás de uma chave: ligada, o modelo é
      # obrigado a devolver o formato; desligada (o padrão), o `Agent::Plan`
      # extrai o JSON do texto e a validação contra o manifesto faz o resto.
      output_config[:format_] = { type: :json_schema, schema: schema } if schema

      message = client.messages.create(
        model: model.to_s.to_sym,
        max_tokens: max_tokens,
        system_: Array(system),
        thinking: { type: "adaptive" },
        output_config: output_config,
        messages: messages
      )

      raise Failed, "refusal" if message.stop_reason == :refusal

      Answer.new(
        text: message.content.filter_map { |block| block.text if block.type == :text }.join,
        usage: self.class.usage_from(message.usage),
        model: model.to_s
      )
    rescue ::Anthropic::Errors::APIStatusError => e
      raise Failed, "#{e.class.name.demodulize}: #{e.type}"
    rescue ::Anthropic::Errors::APIConnectionError => e
      raise Failed, e.class.name.demodulize
    end

    # Os quatro números que a conta precisa. Cache lido e cache escrito têm
    # preços diferentes da entrada normal — juntar tudo em "input" mentiria em
    # até 12×.
    def self.usage_from(usage)
      {
        input: usage&.input_tokens.to_i,
        output: usage&.output_tokens.to_i,
        cacheRead: usage&.cache_read_input_tokens.to_i,
        cacheWrite: usage&.cache_creation_input_tokens.to_i
      }
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
