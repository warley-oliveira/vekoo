module References
  # A análise de uma referência: as imagens vão ao modelo de visão com o
  # schema da análise como saída estruturada, e o que volta vira o card.
  #
  # Depois de analisar: o vetor do card (`Embed`), o resumo do texto visível
  # para a conferência de cópia (o texto em si é descartado), o original
  # apagado do storage (fica a miniatura) e o card em revisão. Falha deixa os
  # originais no lugar — é o que permite tentar de novo.
  #
  # O custo é da Vekoo, não de cliente: fica no card e não entra no teto de
  # OPEX de organização nenhuma.
  class Analyze
    DEFAULT_MODEL = "claude-opus-5-5"
    MAX_TOKENS = 16_000

    def self.model = ENV.fetch("REFERENCE_ANALYSIS_MODEL", DEFAULT_MODEL)
    # Ler um post e separar padrão de conteúdo pede cuidado: `high` por padrão.
    def self.effort = ENV.fetch("REFERENCE_ANALYSIS_EFFORT", "high")

    # O que o modelo devolve: a análise (estrita), o encaixe na taxonomia e a
    # transcrição descartável.
    def self.output_schema
      @output_schema ||= {
        "type" => "object",
        "additionalProperties" => false,
        "required" => %w[analysis classification visibleText],
        "properties" => {
          "analysis" => ReferenceCard::Analysis.model_schema,
          "classification" => {
            "type" => "object",
            "additionalProperties" => false,
            "required" => %w[niche archetypes objective format suggestedLayoutId],
            "properties" => {
              "niche" => { "anyOf" => [ { "enum" => Taxonomy::NICHES }, { "type" => "null" } ] },
              "archetypes" => { "type" => "array", "items" => { "enum" => Taxonomy::ARCHETYPES } },
              "objective" => { "enum" => Taxonomy::OBJECTIVES },
              "format" => { "enum" => Taxonomy::FORMATS },
              "suggestedLayoutId" => { "anyOf" => [ { "enum" => Layouts::Registry.ids }, { "type" => "null" } ] }
            }
          },
          "visibleText" => { "type" => "string" }
        }
      }.freeze
    end

    def self.reset! = (@output_schema = nil)

    def initialize(card, chat: Ai::Chat.new, embed: Embed.new)
      @card = card
      @chat = chat
      @embed = embed
    end

    def call
      if @card.originals.empty?
        fail_with("noImages")
        return @card
      end

      @card.update!(analysis_status: "running", analysis_error: nil)
      answer = ask
      payload = Ai::JsonObject.extract(answer.text)
      return fail_with("invalidOutput", answer) unless payload.is_a?(Hash) && payload["analysis"].is_a?(Hash)

      apply(payload, answer)
      log(answer)
      @embed.call(@card)
      @card.originals.purge
      @card
    rescue Ai::Chat::MissingKey
      fail_with("noKey")
    rescue Ai::Chat::Failed => e
      Rails.logger.warn("reference #{@card.id}: #{e.message.first(200)}")
      fail_with(e.message == "refusal" ? "refused" : "failed")
    rescue ActiveRecord::RecordInvalid => e
      Rails.logger.warn("reference #{@card.id}: análise recusada — #{e.record.errors.attribute_names.first(5).join(', ')}")
      fail_with("invalidOutput")
    end

    private

    def ask
      images = @card.ordered_originals.map { |original| Images.for_model(original.download) }
      @chat.answer(
        system: [ { type: "text", text: Prompts.system, cache_control: { type: "ephemeral" } } ],
        messages: [ { role: "user", content: [ *images, { type: "text", text: Prompts.request(@card) } ] } ],
        model: self.class.model,
        max_tokens: MAX_TOKENS,
        effort: self.class.effort,
        schema: self.class.output_schema,
        fallbacks: :default
      )
    end

    # A curadoria manda no que ela já disse (nicho, porte, estilo, objetivo,
    # formato, a mediana da conta); o modelo preenche o que ela deixou em
    # branco. O layout sugerido só entra se servir ao formato.
    def apply(payload, answer)
      found = payload["classification"].is_a?(Hash) ? payload["classification"] : {}
      metrics = payload["analysis"]["metrics"].to_h.merge(
        "baselineMedian" => @card.analysis.dig("metrics", "baselineMedian"),
        "collectedAt" => @card.analysis.dig("metrics", "collectedAt")
      )

      @card.assign_attributes(
        analysis: payload["analysis"].merge("metrics" => metrics),
        niche: @card.niche || pick(found["niche"], Taxonomy::NICHES),
        archetypes: @card.archetypes.presence || (Array(found["archetypes"]) & Taxonomy::ARCHETYPES).first(ReferenceCard::MAX_ARCHETYPES),
        objective: @card.objective || pick(found["objective"], Taxonomy::OBJECTIVES),
        format: @card.format || pick(found["format"], Taxonomy::FORMATS),
        copy_shingles: CopyGuard.shingles(payload["visibleText"]),
        analysis_status: "done",
        analysis_error: nil,
        analysis_model: answer.model,
        analysis_usage: answer.usage,
        analysis_cost_micro_usd: @card.analysis_cost_micro_usd + Agent::Pricing.micro_usd(answer.model, answer.usage),
        analyzed_at: Time.current,
        status: "in_review"
      )
      @card.suggested_layout_id ||= layout_for(found["suggestedLayoutId"])
      @card.save!
    end

    # Quem atendeu, não quem foi pedido: com o fallback de recusa eles
    # divergem, e a conta (`analysis_cost_micro_usd`) já é a de quem atendeu.
    def log(answer)
      cost = Agent::Pricing.micro_usd(answer.model, answer.usage) / 1_000_000.0
      if answer.model != self.class.model
        Rails.logger.warn("reference #{@card.id}: #{self.class.model} recusou; atendeu #{answer.model} (fallback)")
      end
      Rails.logger.info("reference #{@card.id}: analisada por #{answer.model} — US$ #{format('%.4f', cost)}")
    end

    def pick(value, allowed) = allowed.include?(value) ? value : nil

    def layout_for(id)
      contract = Layouts::Registry.find(id)
      contract.id if contract && @card.piece_formats.any? { |format| contract.supports?(format) }
    end

    # O motivo fica no card, para a tela dizer e oferecer "tentar de novo". A
    # conta do que já foi gasto (resposta que veio torta) entra mesmo assim.
    def fail_with(code, answer = nil)
      attributes = { analysis_status: "failed", analysis_error: { "code" => code } }
      if answer
        attributes[:analysis_cost_micro_usd] = @card.analysis_cost_micro_usd + Agent::Pricing.micro_usd(answer.model, answer.usage)
        attributes[:analysis_model] = answer.model
      end
      @card.reload.update_columns(attributes.merge(updated_at: Time.current))
    end
  end
end
