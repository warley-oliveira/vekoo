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

    # O que `answer` devolve: o texto e o que ele custou. Com ferramentas,
    # também os pedidos de ferramenta (`tool_uses`: id, nome, entrada) e o
    # conteúdo cru (`content`), que volta ao modelo **como veio** — os blocos
    # de pensamento entre uma ferramenta e outra precisam ir junto.
    Answer = Struct.new(:text, :usage, :model, :content, :tool_uses, :stop_reason, keyword_init: true) do
      def tool_uses = self[:tool_uses] || []
      def tool_use? = tool_uses.any?
    end

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
      raise Failed, "#{e.class.name.demodulize}: #{e.type} — #{e.message.to_s[0, 400]}"
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
    #
    # `tools:` liga o uso de ferramenta (escolha do modelo, `auto`): quando ele
    # pede uma, a resposta volta com `tool_uses` e quem chama roda o laço.
    #
    # `fallbacks: :default` vai pelo caminho beta, com a nova tentativa do
    # servidor quando o modelo recusa.
    #
    # O `model` da resposta é sempre o de quem **atendeu** (o campo `model` da
    # mensagem), não o pedido: com o fallback eles divergem, e é por quem
    # atendeu que o custo é calculado e o log é escrito.
    def answer(system:, messages:, model: MODEL, max_tokens: 8_000, effort: "medium", schema: nil, tools: nil, fallbacks: nil)
      output_config = { effort: effort }
      # A saída estruturada fica atrás de uma chave: ligada, o modelo é
      # obrigado a devolver o formato; desligada (o padrão), o `Agent::Plan`
      # extrai o JSON do texto e a validação contra o manifesto faz o resto.
      output_config[:format_] = { type: :json_schema, schema: schema } if schema

      request = {
        model: model.to_s.to_sym,
        max_tokens: max_tokens,
        system_: Array(system),
        thinking: { type: "adaptive" },
        output_config: output_config,
        messages: messages
      }
      request[:tools] = tools if tools.present?
      message =
        if fallbacks
          client.beta.messages.create(**request, fallbacks: fallbacks, betas: [ FALLBACK_BETA ])
        else
          client.messages.create(**request)
        end

      raise Failed, "refusal" if message.stop_reason == :refusal

      Answer.new(
        text: message.content.filter_map { |block| block.text if block.type == :text }.join,
        usage: self.class.usage_from(message.usage),
        model: message.model.to_s.presence || model.to_s,
        content: message.content,
        tool_uses: message.content.filter_map { |block|
          { id: block.id, name: block.name, input: block.input.to_h.deep_stringify_keys } if block.type == :tool_use
        },
        stop_reason: message.stop_reason
      )
    rescue ::Anthropic::Errors::APIStatusError => e
      raise Failed, "#{e.class.name.demodulize}: #{e.type} — #{e.message.to_s[0, 400]}"
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
      raise Failed, "#{e.class.name.demodulize}: #{e.type} — #{e.message.to_s[0, 400]}"
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

    # Uma rodada com histórico, sem fluxo: os blocos de IA dos fluxos, que rodam em job e não têm a quem mostrar
    # pedaços. Quem chama guarda o laço de ferramentas, porque é ele quem sabe rodar cada uma (ver FlowRuntime::Llm).
    #
    # @param messages [Array<Hash>] começa e termina com `user`; a API recusa o resto
    # @param context [String, nil] orientação da rodada, depois do ponto de cache para não invalidá-lo
    # @param schema [Hash, nil] resposta em JSON neste formato, em vez de texto livre
    # @return [Anthropic::Message] com `stop_reason` e `content`, para quem chama seguir o laço
    # @raise [Failed] inclusive quando o modelo recusa
    def respond(system:, messages:, tools: [], context: nil, schema: nil, model: AGENT_MODEL, max_tokens: 16_000, effort: "medium")
      output_config = { effort: effort }
      output_config[:format] = { type: :json_schema, schema: schema } if schema

      params = {
        model: model,
        max_tokens: max_tokens,
        system_: [
          { type: "text", text: system.presence || "Responda em português.", cache_control: { type: "ephemeral" } },
          (context && { type: "text", text: context })
        ].compact,
        thinking: { type: "adaptive" },
        output_config: output_config,
        messages: messages
      }
      params[:tools] = tools if tools.present?

      message =
        if model == AGENT_MODEL
          client.beta.messages.create(**params, betas: [ FALLBACK_BETA ], fallbacks: :default)
        else
          client.messages.create(**params)
        end

      raise Failed, "refusal" if message.stop_reason == :refusal

      message
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
