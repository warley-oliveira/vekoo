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

    # O copiloto do chat: um agente com ferramentas, que decide sozinho o que consultar. O modelo é
    # o mesmo que a origem usava nele. As tarefas pequenas dele (resumir, qualificar uma conversa
    # de cada vez) vão no modelo rápido.
    AGENT_MODEL = :"claude-opus-5-5"
    FAST_MODEL = :"claude-haiku-5-5"
    # Recusa de classificador refeita em outro modelo pelo servidor, escolhido pela categoria.
    FALLBACK_BETA = "server-side-fallback-2026-07-01".freeze

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

    # Uma rodada de conversa com ferramentas, em fluxo: entrega o texto em pedaços e devolve a
    # mensagem inteira, para quem chama decidir o que fazer com `stop_reason` e os `tool_use`.
    #
    # `system` é o bloco estável, e é ele que carrega o `cache_control` (o cache cobre as ferramentas
    # também, que vêm antes). `context` é o que muda a cada turno (a data de hoje), depois do ponto
    # de cache para não invalidá-lo.
    def converse(system:, messages:, tools:, context: nil, max_tokens: 64_000, effort: "medium")
      stream = client.beta.messages.stream(
        model: AGENT_MODEL,
        max_tokens: max_tokens,
        system_: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
          (context && { type: "text", text: context })
        ].compact,
        thinking: { type: "adaptive" },
        output_config: { effort: effort },
        tools: tools,
        messages: messages,
        betas: [ FALLBACK_BETA ],
        fallbacks: :default
      )

      stream.each { |event| yield event.text if event.type == :text }
      stream.accumulated_message
    rescue ::Anthropic::Errors::APIStatusError => e
      raise Failed, "#{e.class.name.demodulize}: #{e.type}"
    rescue ::Anthropic::Errors::APIConnectionError => e
      raise Failed, e.class.name.demodulize
    end

    # O conteúdo de uma resposta como volta na rodada seguinte. Os blocos de pensamento precisam
    # voltar intactos. A exceção é a virada de modelo no meio da escrita: o que veio antes do último
    # bloco `fallback` foi do modelo que recusou, e pensamento e chamada de ferramenta dele não valem
    # mais; o próprio bloco é só um marcador.
    #
    # Os blocos voltam como objetos do SDK, sem `to_h`: é o SDK que sabe os nomes do fio, e o `to_h`
    # devolve os dele (`caller_`), que a API recusa.
    def self.echoable(content)
      blocks = content.to_a
      boundary = blocks.rindex { |block| block.type == :fallback }

      blocks.each_with_index.filter_map do |block, index|
        next if block.type == :fallback
        next if boundary && index < boundary && %i[thinking redacted_thinking tool_use].include?(block.type)

        block
      end
    end

    # Uma resposta só, para quando não há o que mostrar em pedaços.
    def complete(system:, prompt:, max_tokens: 1_000, effort: "low", model: MODEL)
      message = client.messages.create(
        model: model,
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

    # Uma resposta em que o modelo pode consultar ou mudar algo pelo caminho.
    # O laço mora aqui para o SDK continuar só nesta classe: quem chama passa as
    # ferramentas e um bloco que recebe `(nome, entrada)` e devolve o resultado.
    #
    # Passou de `max_rounds`, a última rodada proíbe novas chamadas: o modelo
    # precisa responder com o que já tem, em vez de a mensagem se perder.
    def complete_with_tools(system:, prompt:, tools:, max_tokens: 2_000, effort: "low", max_rounds: 4)
      messages = [ { role: "user", content: prompt } ]
      rounds = 0

      loop do
        message = client.messages.create(
          model: MODEL,
          max_tokens: max_tokens,
          system_: [ { type: "text", text: system, cache_control: { type: "ephemeral" } } ],
          thinking: { type: "adaptive" },
          output_config: { effort: effort },
          tools: tools,
          tool_choice: { type: rounds >= max_rounds ? "none" : "auto" },
          messages: messages
        )

        raise Failed, "refusal" if message.stop_reason == :refusal

        calls = message.content.select { |block| block.type == :tool_use }
        if message.stop_reason != :tool_use || calls.empty?
          return message.content.filter_map { |block| block.text if block.type == :text }.join
        end

        # A resposta volta inteira, com os blocos de pensamento: é o que a API
        # exige para continuar a mesma rodada de ferramentas.
        messages << { role: :assistant, content: message.content }
        messages << { role: :user, content: calls.map { |call| tool_result(call) { |name, input| yield(name, input) } } }
        rounds += 1
      end
    rescue ::Anthropic::Errors::APIStatusError => e
      raise Failed, "#{e.class.name.demodulize}: #{e.type}"
    rescue ::Anthropic::Errors::APIConnectionError => e
      raise Failed, e.class.name.demodulize
    end

    private

    # Ferramenta que falhou volta como erro para o modelo, em vez de derrubar a
    # geração: ele costuma conseguir terminar sem aquele dado.
    def tool_result(call)
      result = yield(call.name, call.input.to_h)

      { type: :tool_result, tool_use_id: call.id, content: result.to_json }
    rescue StandardError => e
      Rails.logger.warn("ai: ferramenta #{call.name}: #{e.class}: #{e.message}")
      { type: :tool_result, tool_use_id: call.id, content: "Falha ao executar a ferramenta.", is_error: true }
    end

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
