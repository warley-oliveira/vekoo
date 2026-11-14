module References
  # Refaz campos de classificação de um card já analisado — o gancho
  # (`hook.type`), a replicabilidade (`replicability.score`) e o que o post
  # exige (`replicability.requires`) — quando o critério muda
  # (`Prompts::CALIBRATION`) ou um campo novo nasce. Só os campos pedidos
  # (`fields:`) são gravados; o resto do card fica como está.
  #
  # Lê a análise gravada: o original foi apagado depois da análise e a legenda
  # nunca foi guardada. O modelo julga pelo que a análise descreve do post, sem
  # ver a classificação antiga (para não ancorar nela).
  #
  # O gancho entra no texto do vetor (`CardText`): quem refaz o gancho refaz o
  # embedding — em série, porque a cota de embedding do Vertex é por minuto.
  class Reclassify
    MAX_TOKENS = 8_000
    FIELDS = %i[hook replicability requires].freeze

    ROLE = <<~TEXT.freeze
      Você revisa campos de classificação de um card do banco de referências do
      Vekoo — uma plataforma que cria peças de Instagram para pequenos negócios.
      Você não vê o post: lê a análise que foi feita olhando para ele e decide
      pelos critérios abaixo.

      Responda só as chaves do formato pedido:
      - `hookType`, `replicability` e `requires`, pelos critérios;
      - `hookFit`: `clear` se o gancho cabe com folga num tipo da lista,
        `forced` se nenhum serve de verdade e você escolheu o menos errado;
      - `reason`: uma frase curta com o motivo das escolhas.
    TEXT

    # Campo → as chaves que ele pede na saída do modelo, e a lista que vai ao prompt.
    OUTPUT = {
      hook: { "hookType" => { "enum" => Taxonomy::HOOK_TYPES }, "hookFit" => { "enum" => %w[clear forced] } },
      replicability: { "replicability" => { "enum" => Taxonomy::REPLICABILITY } },
      requires: { "requires" => { "type" => "array", "items" => { "enum" => Taxonomy::REQUIRES } } }
    }.freeze
    LISTS = { hook: :hook_types, replicability: :replicability, requires: :requires }.freeze
    WHAT = { hook: "o gancho", replicability: "a replicabilidade", requires: "o que o post exige" }.freeze

    # O que mudou (`before`/`after`), mais o diagnóstico do modelo (`fit`,
    # `reason`) — que não é gravado: serve à curadoria conferir a calibração.
    Result = Struct.new(:card, :before, :after, :fit, :reason, :cost_micro_usd, keyword_init: true) do
      def changed? = before != after
    end

    def self.output_schema(fields)
      properties = fields.map { |field| OUTPUT.fetch(field) }.reduce(:merge).merge("reason" => { "type" => "string" })
      { "type" => "object", "additionalProperties" => false, "required" => properties.keys, "properties" => properties }
    end

    def self.system(fields = %i[hook replicability])
      [ ROLE, Prompts::CALIBRATION, Prompts.taxonomy(*fields.map { |field| LISTS.fetch(field) }) ].join("\n")
    end

    # `fields`: o que refazer — por padrão o gancho e a replicabilidade, os dois
    # da recalibração; `requires` nasceu depois e se pede à parte.
    def initialize(card, fields: %i[hook replicability], chat: Ai::Chat.new)
      @card = card
      @fields = FIELDS & fields.map(&:to_sym)
      raise ArgumentError, "nenhum campo para refazer" if @fields.empty?

      @chat = chat
    end

    # `dry_run`: pergunta e devolve o resultado sem gravar nada.
    def call(dry_run: false)
      answer = ask
      after = read(Ai::JsonObject.extract(answer.text))
      raise Ai::Chat::Failed, "invalidOutput" unless after

      cost = Agent::Pricing.micro_usd(answer.model, answer.usage)
      result = Result.new(
        card: @card, before: current, after: after.except(:fit, :reason),
        fit: after[:fit], reason: after[:reason], cost_micro_usd: cost
      )
      apply(result) unless dry_run
      result
    end

    private

    def ask
      @chat.answer(
        system: [ { type: "text", text: self.class.system(@fields), cache_control: { type: "ephemeral" } } ],
        messages: [ { role: "user", content: [ { type: "text", text: description } ] } ],
        model: Analyze.model,
        max_tokens: MAX_TOKENS,
        effort: Analyze.effort,
        schema: self.class.output_schema(@fields),
        fallbacks: :default
      )
    end

    def current
      { hook: @card.hook_type, replicability: @card.replicability, requires: @card.requires }.slice(*@fields)
    end

    # A resposta → os campos pedidos, ou nil se algum veio fora da lista. Os
    # requisitos ficam na ordem da taxonomia, sem repetir.
    def read(payload)
      return unless payload.is_a?(Hash)

      after = { fit: payload["hookFit"], reason: payload["reason"].to_s }
      if @fields.include?(:hook)
        return unless Taxonomy::HOOK_TYPES.include?(payload["hookType"])

        after[:hook] = payload["hookType"]
      end
      if @fields.include?(:replicability)
        return unless Taxonomy::REPLICABILITY.include?(payload["replicability"])

        after[:replicability] = payload["replicability"]
      end
      if @fields.include?(:requires)
        needs = payload["requires"]
        return unless needs.is_a?(Array) && (needs - Taxonomy::REQUIRES).empty?

        after[:requires] = Taxonomy::REQUIRES & needs
      end
      after
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
      lines << "\nDecida #{@fields.map { |field| WHAT.fetch(field) }.to_sentence(words_connector: ', ', two_words_connector: ' e ', last_word_connector: ' e ')}."
      lines.join("\n")
    end

    def apply(result)
      analysis = @card.analysis.deep_dup
      analysis["hook"]["type"] = result.after[:hook] if result.after.key?(:hook)
      analysis["replicability"]["score"] = result.after[:replicability] if result.after.key?(:replicability)
      analysis["replicability"]["requires"] = result.after[:requires] if result.after.key?(:requires)
      @card.update!(analysis: analysis, analysis_cost_micro_usd: @card.analysis_cost_micro_usd + result.cost_micro_usd)
    end
  end
end
