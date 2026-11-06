module FlowRuntime
  # A chamada ao modelo que os blocos de IA fazem, sobre a camada `Ai::`, cobrando crédito antes e devolvendo se nada útil
  # saiu. É aqui que o `model_size` do bloco vira um modelo.
  #
  #   main   Opus 5.5, o mesmo do copiloto: é quem conversa com o contato
  #   fast   Haiku 5.5: juiz de saída, classificação, extração
  #
  # `temperature` da origem não existe mais: os modelos atuais recusam. O bloco controla pelo prompt.
  class Llm
    class NoCredits < StandardError; end

    COSTS = { "main" => 2, "fast" => 1 }.freeze
    MODELS = { "main" => Ai::Chat::AGENT_MODEL, "fast" => Ai::Chat::FAST_MODEL }.freeze
    MAX_TOOL_ROUNDS = 5

    def self.size_of(value)
      MODELS.key?(value.to_s) ? value.to_s : "main"
    end

    def self.cost_of(size)
      COSTS.fetch(size_of(size))
    end

    def initialize(organization, chat: Ai::Chat.new)
      @organization = organization
      @chat = chat
    end

    # Uma resposta em JSON, no formato de `schema`. O corte de tokens leva em conta o pensamento, que conta nele.
    #
    # @return [Hash]
    # @raise [NoCredits, Ai::Chat::Failed, Ai::Chat::MissingKey]
    def structured(system:, prompt:, schema:, size: "fast", effort: "low", max_tokens: 4_000, cost: nil)
      size = self.class.size_of(size)

      billed(cost || self.class.cost_of(size)) do
        message = chat.respond(
          system: system,
          messages: [ { role: "user", content: prompt } ],
          schema: schema,
          model: MODELS.fetch(size),
          max_tokens: max_tokens,
          effort: effort
        )
        parse_json(text_of(message))
      end
    end

    # Uma resposta de conversa, com o laço de ferramentas. O bloco recebe `(nome, entrada)` e devolve o resultado.
    #
    # @param instruction [String, nil] orientação da rodada, fora do bloco em cache do `system`
    # @return [String] o texto para o contato; pode ser vazio
    # @raise [NoCredits, Ai::Chat::Failed, Ai::Chat::MissingKey]
    def converse(system:, messages:, tools: [], size: "main", instruction: nil, effort: "medium", cost: nil, &on_tool)
      size = self.class.size_of(size)

      billed(cost || self.class.cost_of(size)) do
        run_tool_loop(system, messages.dup, tools, MODELS.fetch(size), instruction, effort, &on_tool)
      end
    end

    private

    attr_reader :organization, :chat

    def run_tool_loop(system, messages, tools, model, instruction, effort)
      MAX_TOOL_ROUNDS.times do
        response = chat.respond(system: system, messages: messages, tools: tools, context: instruction, model: model, effort: effort)
        calls = response.content.select { |block| block.type == :tool_use }
        return text_of(response) if response.stop_reason != :tool_use || calls.empty?

        # A resposta volta inteira, com os blocos de pensamento: é o que a API exige para continuar a rodada.
        messages << { role: "assistant", content: Ai::Chat.echoable(response.content) }
        messages << { role: "user", content: calls.map { |call| tool_result(call) { |name, input| yield(name, input) } } }
      end

      raise Ai::Chat::Failed, "max_tool_loops_exceeded"
    end

    # Ferramenta que falhou volta como erro para o modelo: ele costuma conseguir responder sem aquele dado.
    def tool_result(call)
      output = yield(call.name, call.input.to_h)
      { type: :tool_result, tool_use_id: call.id, content: Limits.clip(output.to_json, Limits::MAX_TOOL_OUTPUT_BYTES) }
    rescue StandardError => e
      Rails.logger.warn("[FlowRuntime::Llm] ferramenta #{call.name}: #{e.class}: #{e.message}")
      { type: :tool_result, tool_use_id: call.id, content: { error: e.message.truncate(500) }.to_json, is_error: true }
    end

    def billed(cost)
      return yield if cost.to_i.zero?
      raise NoCredits unless organization.consume_credits(cost)

      begin
        yield
      rescue StandardError
        organization.refund_credits!(cost)
        raise
      end
    end

    def text_of(message)
      message.content.filter_map { |block| block.text if block.type == :text }.join
    end

    def parse_json(text)
      parsed = JSON.parse(text.to_s)
      raise Ai::Chat::Failed, "invalid_json" unless parsed.is_a?(Hash)

      parsed
    rescue JSON::ParserError
      raise Ai::Chat::Failed, "invalid_json"
    end
  end
end
