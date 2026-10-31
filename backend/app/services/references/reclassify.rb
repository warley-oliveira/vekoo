module References
  # Refaz só o gancho (`hook.type`) e a replicabilidade (`replicability.score`)
  # de um card já analisado, quando o critério dos dois muda
  # (`Prompts::CALIBRATION`). O resto do card fica como está.
  #
  # Lê a análise gravada: o original foi apagado depois da análise e a legenda
  # nunca foi guardada. O modelo julga pelo que a análise descreve do post, sem
  # ver a classificação antiga (para não ancorar nela).
  #
  # O gancho entra no texto do vetor (`CardText`): quem chama refaz o embedding
  # — em série, porque a cota de embedding do Vertex é por minuto.
  class Reclassify
    MAX_TOKENS = 8_000

    ROLE = <<~TEXT.freeze
      Você revisa dois campos de um card do banco de referências do Vekoo — uma
      plataforma que cria peças de Instagram para pequenos negócios: o tipo de
      gancho e a replicabilidade. Você não vê o post: lê a análise que foi
      feita olhando para ele e decide pelos critérios abaixo.

      Responda:
      - `hookType` e `replicability`, pelos critérios;
      - `hookFit`: `clear` se o gancho cabe com folga num tipo da lista,
        `forced` se nenhum serve de verdade e você escolheu o menos errado;
      - `reason`: uma frase curta com o motivo das duas escolhas.
    TEXT

    OUTPUT_SCHEMA = {
      "type" => "object",
      "additionalProperties" => false,
      "required" => %w[hookType hookFit replicability reason],
      "properties" => {
        "hookType" => { "enum" => Taxonomy::HOOK_TYPES },
        "hookFit" => { "enum" => %w[clear forced] },
        "replicability" => { "enum" => Taxonomy::REPLICABILITY },
        "reason" => { "type" => "string" }
      }
    }.freeze

    # O que mudou (`before`/`after`), mais o diagnóstico do modelo (`fit`,
    # `reason`) — que não é gravado: serve à curadoria conferir a calibração.
    Result = Struct.new(:card, :before, :after, :fit, :reason, :cost_micro_usd, keyword_init: true) do
      def changed? = before != after
    end

    def self.system = [ ROLE, Prompts::CALIBRATION, Prompts.taxonomy(:hook_types, :replicability) ].join("\n")

    def initialize(card, chat: Ai::Chat.new)
      @card = card
      @chat = chat
    end

    # `dry_run`: pergunta e devolve o resultado sem gravar nada.
    def call(dry_run: false)
      answer = ask
      payload = Ai::JsonObject.extract(answer.text)
      raise Ai::Chat::Failed, "invalidOutput" unless payload.is_a?(Hash) && Taxonomy::HOOK_TYPES.include?(payload["hookType"]) &&
        Taxonomy::REPLICABILITY.include?(payload["replicability"])

      cost = Agent::Pricing.micro_usd(answer.model, answer.usage)
      result = Result.new(
        card: @card, before: { hook: @card.hook_type, replicability: @card.replicability },
        after: { hook: payload["hookType"], replicability: payload["replicability"] },
        fit: payload["hookFit"], reason: payload["reason"].to_s, cost_micro_usd: cost
      )
      apply(result) unless dry_run
      result
    end

    private

    def ask
      @chat.answer(
        system: [ { type: "text", text: self.class.system, cache_control: { type: "ephemeral" } } ],
        messages: [ { role: "user", content: [ { type: "text", text: description } ] } ],
        model: Analyze.model,
        max_tokens: MAX_TOKENS,
        effort: Analyze.effort,
        schema: OUTPUT_SCHEMA,
        fallbacks: :default
      )
    end

    # A análise como o modelo a lê: o que ela diz do post, nunca a
    # classificação antiga nem a fonte.
    def description
      analysis = @card.analysis
      structure = analysis["structure"]
      beats = Array(structure["beats"]).each_with_index.map { |beat, index| "#{index + 1}. #{beat}" }
      why = analysis["whyItWorks"]
      lines = []
      lines << "Formato: #{@card.format} (#{Taxonomy.describe(:formats, @card.format)})." if @card.format
      lines << "Porte da conta: #{@card.size} (#{Taxonomy.describe(:sizes, @card.size)})." if @card.size
      lines << "O post tem vídeo: a análise viu só a capa." if @card.partial_analysis
      lines << "\nA abertura, como a análise descreveu: #{analysis.dig('hook', 'description')}"
      lines << "\nEstrutura: #{structure['summary']}\n#{beats.join("\n")}"
      lines << "\nVisual: #{analysis['visual'].values.compact_blank.join(' ')}"
      lines << "\nTexto do post — função: #{analysis.dig('copy', 'function')} Tom: #{analysis.dig('copy', 'tone')} Chamada: #{analysis.dig('copy', 'cta')}"
      lines << "\nPor que funciona: #{why['mechanism']} Princípio: #{why['transferablePrinciple']}"
      lines << "\nO que um negócio precisa para repetir, segundo a análise: #{analysis.dig('replicability', 'requirements')}"
      lines << "\nDecida o gancho e a replicabilidade."
      lines.join("\n")
    end

    def apply(result)
      analysis = @card.analysis.deep_dup
      analysis["hook"]["type"] = result.after[:hook]
      analysis["replicability"]["score"] = result.after[:replicability]
      @card.update!(analysis: analysis, analysis_cost_micro_usd: @card.analysis_cost_micro_usd + result.cost_micro_usd)
    end
  end
end
