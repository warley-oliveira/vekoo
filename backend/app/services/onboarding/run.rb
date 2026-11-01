module Onboarding
  # Uma fala da pessoa no onboarding, do que ela disse até a resposta do
  # agente. Roda em segundo plano (`AgentTurnJob`), como o turno de criação de
  # peças: a mesma fila, o mesmo canal (`AgentChannel`) e a mesma conta de
  # custo no turno.
  #
  # A resposta do agente sai em `plan["reply"]` como uma lista de **códigos**
  # — status gravado, pergunta seguinte, propostas, resumo. Quem escreve o
  # texto é a tela, no idioma dela. A única fala que vem pronta é o
  # seguimento, porque ele é sobre o que a pessoa disse.
  #
  # O fluxo é do servidor, não do modelo: o modelo lê a resposta; quem decide
  # se o tema fecha, se cabe um seguimento e qual é a próxima pergunta é este
  # objeto. Assim a conversa não pula tema nem pergunta duas vezes a mesma
  # coisa por capricho de uma geração.
  class Run
    SUGGEST_KIND = { "voice" => "voice", "palette" => "palette", "fonts" => "fonts", "logo" => "wordmark" }.freeze
    CHOICE_TOPIC = { "voice" => "voice", "palette" => "palette", "fonts" => "fonts", "wordmark" => "logo" }.freeze

    def self.suggest_kind(topic) = SUGGEST_KIND[topic.to_s]

    def initialize(turn, chat: Ai::Chat.new)
      @turn = turn
      @chat = chat
      @conversation = turn.conversation
      @brand = @conversation.brand_core
      @topic = turn.plan["topic"].presence || @brand.onboarding_topic
      @reply = []
      @usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      @cost = 0
      @model = nil
    end

    def call
      case @turn.kind
      when "answer" then answer
      when "suggest" then suggest(@turn.plan["suggestKind"].presence || self.class.suggest_kind(@topic))
      when "choose" then choose
      when "logo" then logo
      end
      finish(status: "answered")
    rescue Ai::Chat::Failed => e
      Rails.logger.warn("onboarding turn #{@turn.id}: #{e.message}")
      fail_with("modelDown")
    rescue StandardError => e
      Rails.logger.error("onboarding turn #{@turn.id}: #{e.class}: #{e.message[0, 200]}")
      fail_with("failed")
    end

    private

    # ------------------------------------------------------------ resposta

    def answer
      # Em "cores e fonte" o seguimento pode ser sobre a fonte que faltou.
      follow_up_topic = @topic == "palette" ? "fonts" : @topic
      available = summary? || follow_up_available?(@topic) || follow_up_available?(follow_up_topic)
      result = Interpret.call(@brand, topic: @topic, text: @turn.prompt,
        follow_up_available: available, chat: model_chat)
      account(result)

      outcome = Fields.apply(@brand, result.fields, topic: @topic)
      @brand.track_onboarding(segment: result.fields["segmentCode"])
      return adjust(outcome, result) if summary?

      # "Não sei" escrito vale o mesmo que o chip.
      if result.wants_suggestion? && BrandCore::Onboarding.suggestible?(@topic)
        saved(outcome.touched - [ @topic ])
        return suggest(self.class.suggest_kind(@topic))
      end

      if outcome.missing_font
        close("palette") if @topic == "palette" && satisfied?("palette")
        saved(outcome.touched)
        font_missing(outcome)
        return record("answered")
      end

      if result.skip? && !BrandCore::Onboarding.required?(@topic)
        close(@topic)
        saved(outcome.touched)
        record("skipped")
        return ask_next
      end

      # Cores e fonte são uma pergunta só: a resposta pode fechar as duas.
      if @topic == "palette" && satisfied?("palette")
        close("palette")
        close("fonts") if outcome.touched.include?("fonts")
        saved(outcome.touched)
        record("answered")
        return ask_next if satisfied?("fonts")

        return follow_up(follow_up_topic, result.follow_up) if follow_up_available?(follow_up_topic) && result.follow_up

        return ask_next
      end

      # Vaga de novo depois do seguimento, mas com o dado no documento: fecha.
      # Repetir a pergunta aí só prende a pessoa no mesmo tema.
      if satisfied?(@topic) && (!result.vague? || !follow_up_available?(@topic))
        close(@topic)
        saved(outcome.touched)
        record("answered")
        return ask_next
      end

      saved(outcome.touched - [ @topic ])
      if follow_up_available?(@topic)
        follow_up(@topic, result.follow_up)
      elsif BrandCore::Onboarding.required?(@topic)
        # Tema obrigatório não fecha vazio: a pergunta volta, com o "cria pra
        # mim" à mão na tela.
        question(@topic)
      else
        close(@topic)
        saved([ @topic ] & outcome.touched)
        record("answered")
        ask_next
      end
    end

    # Depois do resumo, tudo o que a pessoa escreve é ajuste: o modelo vê
    # todos os campos, o status do que mudou aparece e o resumo volta.
    def adjust(outcome, result)
      saved(outcome.touched)
      redraw_wordmark if (outcome.touched & %w[brand palette fonts]).any?

      if outcome.missing_font
        font_missing(outcome)
      elsif outcome.touched.any?
        @reply << { "type" => "summary" }
      elsif result.follow_up
        @reply << { "type" => "followUp", "text" => result.follow_up }
      else
        say("adjustAsk")
      end
      record("answered")
    end

    # A que existe já entrou: dizer isso responde o "não tem nem a X?" — falar
    # só da que falta parece que ela não foi ouvida.
    def font_missing(outcome)
      @brand.track_onboarding(wanted_font: outcome.missing_font)
      if outcome.kept_font
        say("fontPartial", font: outcome.missing_font, kept: outcome.kept_font)
      else
        say("fontMissing", font: outcome.missing_font)
      end
    end

    def follow_up(topic, text)
      @brand.track_onboarding(follow_up: topic)
      if text
        @reply << { "type" => "followUp", "text" => text }
      else
        say("followUpGeneric")
      end
      record("followed_up")
    end

    # ----------------------------------------------------- "cria pra mim"

    def suggest(kind)
      return wordmark_noted if kind == "wordmark"

      result =
        if model_chat
          Suggest.call(@brand, kind: kind, chat: model_chat)
        else
          Suggest.curated(@brand, kind: kind)
        end
      account(result)

      if result.kept
        say("suggest.fontsKept", kept: result.kept)
      else
        say("suggest.#{kind}")
      end
      @reply << { "type" => "options", "kind" => kind, "source" => result.source, "items" => result.options }
      record("suggested", payload: { "kind" => kind, "source" => result.source })
    end

    # Na logo, o "cria pra mim" não propõe nada agora: o logotipo usa a fonte,
    # e a fonte é a pergunta seguinte. Fica anotado e sai desenhado no resumo.
    def wordmark_noted
      @brand.track_onboarding(wants_wordmark: true)
      close("logo")
      say("wordmarkNoted")
      @reply << { "type" => "status", "topic" => "logoNoted" }
      record("suggested", payload: { "kind" => "wordmark" })
      ask_next
    end

    def choose
      choice = @turn.plan["choice"] || {}
      kind = choice["kind"].to_s
      topic = CHOICE_TOPIC.fetch(kind)
      in_summary = summary?

      Fields.choose(@brand, kind, choice["option"])
      close(topic)
      @reply << { "type" => "confirm", "topic" => topic }
      record("answered", step: topic, payload: { "kind" => kind })

      if kind == "wordmark"
        logo_saved
        @reply << { "type" => "summary" }
      elsif in_summary
        redraw_wordmark if kind.in?(%w[palette fonts])
        @reply << { "type" => "summary" }
      elsif kind == "palette" && !closed?("fonts")
        # Os dois seletores em sequência: quem pediu a paleta quer a fonte
        # proposta também, sem ter que pedir de novo.
        suggest("fonts")
      else
        ask_next
      end
    end

    def logo
      asset = @brand.assets.find_by(id: @turn.plan["assetId"], kind: "logo")
      @brand.track_onboarding(wants_wordmark: false)
      @brand.choose_logo(asset.logo_id) if asset&.logo_id
      close("logo")
      @reply << { "type" => "status", "topic" => "logoUploaded" }
      logo_saved
      # Fundo chapado estraga toda peça de fundo escuro: melhor saber agora.
      say("logoOpaque") if asset&.transparent == false
      record("answered", step: "logo")
      summary? ? @reply << { "type" => "summary" } : ask_next
    end

    # ----------------------------------------------------------- caminho

    def ask_next
      upcoming = @brand.onboarding_topic
      return question(upcoming) unless upcoming == BrandCore::Onboarding::SUMMARY

      draw_wordmark
      @reply << { "type" => "summary" }
    end

    # "a logo não some": ela é um ativo da marca, com download e troca depois.
    def logo_saved
      @reply << { "type" => "status", "topic" => "logoSaved" }
    end

    def question(topic)
      @reply << { "type" => "question", "topic" => topic }
    end

    def saved(topics)
      (BrandCore::Onboarding::TOPICS & Array(topics)).each do |topic|
        @reply << { "type" => "status", "topic" => topic }
      end
    end

    def say(code, **params)
      item = { "type" => "text", "code" => code }
      item["params"] = params.stringify_keys if params.any?
      @reply << item
    end

    def close(topic)
      @brand.track_onboarding(close: topic)
    end

    def closed?(topic) = @brand.onboarding_closed.include?(topic)

    def satisfied?(topic)
      BrandCore::Onboarding.satisfied?(topic, @brand.full_document)
    end

    def follow_up_available?(topic)
      !@brand.onboarding_follow_ups.include?(topic)
    end

    def summary?
      @topic == BrandCore::Onboarding::SUMMARY
    end

    # O logotipo de quem pediu "cria pra mim" na logo, desenhado quando a
    # conversa chega ao resumo — é a primeira vez que a fonte existe. Saem
    # três desenhos; o primeiro já entra como principal (o resumo precisa de
    # uma logo) e a pessoa troca clicando noutro.
    def draw_wordmark
      return unless @brand.wants_wordmark?
      return if @brand.assets.exists?(kind: "logo")

      @brand.save!
      logo_ids = RenderWordmark.options!(@brand, account: @turn.account)
      return if logo_ids.empty?

      @brand.choose_logo(logo_ids.first)
      say("wordmarkReady")
      options = {
        "type" => "options", "kind" => "wordmark", "source" => "curated",
        "items" => logo_ids.map { |id| { "logoId" => id, "style" => @brand.logos.find_logo(id)&.style } }
      }
      # As logos com símbolo (`Logos::Concepts`) chegam depois, no mesmo
      # bloco: o job sai quando o turno estiver gravado (`finish`).
      if Logos::Concepts.available?
        options["pending"] = Logos::Concepts::DIRECTIONS.size
        @logo_concepts = true
      end
      @reply << options
    end

    # Ajustou nome, cor ou fonte depois do resumo: o logotipo nosso acompanha,
    # no mesmo estilo, como logo nova — a anterior fica nos ativos. Logo
    # enviada pela pessoa nunca é tocada.
    def redraw_wordmark
      current = @brand.primary_logo
      return unless current&.generated?

      @brand.save!
      logo_id = RenderWordmark.attach!(@brand, account: @turn.account, style: current.style || "asWritten")
      @brand.choose_logo(logo_id) if logo_id
    end

    # -------------------------------------------------------------- dinheiro

    # O onboarding não gasta crédito da pessoa: só conta no teto de OPEX da
    # Vekoo. Teto batido, a conversa segue sem o modelo — a pessoa não fica
    # sabendo que houve um limite.
    def model_chat
      return @model_chat if defined?(@model_chat)

      @model_chat =
        begin
          Agent::Budget.check!(@turn.organization)
          @chat
        rescue Agent::Budget::CapReached
          Rails.logger.error("onboarding: teto de custo do mês atingido (org #{@turn.organization_id})")
          nil
        end
    end

    def account(result)
      @model = result.model.presence || @model
      @usage = @usage.merge((result.usage || {}).symbolize_keys) { |_key, a, b| a.to_i + b.to_i }
      @cost += result.cost_micro_usd.to_i
    end

    def record(action, step: nil, payload: {})
      OnboardingEvent.create!(
        organization: @turn.organization, brand_core: @brand, account: @turn.account,
        step: step || @topic, action: action, payload: payload,
        model: @model, usage: @usage, cost_micro_usd: @cost
      )
    rescue StandardError => e
      # Telemetria não derruba cadastro.
      Rails.logger.warn("onboarding_event: #{e.class}: #{e.message[0, 120]}")
    end

    # ------------------------------------------------------------- fim

    def finish(status:, error: nil)
      @brand.save! if status == "answered"
      @turn.update!(
        status: status,
        plan: @turn.plan.merge("reply" => status == "answered" ? @reply : []),
        error: error,
        model: @model,
        usage: @usage,
        cost_micro_usd: @cost
      )
      @conversation.touch_turn!
      broadcast
      LogoConceptsJob.perform_later(@turn.id) if @logo_concepts && status == "answered"
      @turn
    end

    # A resposta dela fica no turno (`prompt`): é o que "tenta de novo"
    # reenvia, sem ela ter que digitar outra vez.
    def fail_with(code)
      @brand.reload
      finish(status: "failed", error: { "code" => code })
    end

    def broadcast
      AgentChannel.broadcast_to(@turn.organization, AgentTurnSerializer.event(@turn.reload))
      BrandCoreChannel.broadcast_to(
        @turn.organization,
        BrandCoreSerializer.event(@brand, event: "updated", account: @turn.account)
      )
    end
  end
end
