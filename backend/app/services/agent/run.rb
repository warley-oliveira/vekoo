module Agent
  # Um turno da conversa, do pedido às peças na fila.
  #
  # Roda em segundo plano (`AgentTurnJob`): a chamada ao modelo leva dezenas de
  # segundos e segurar uma thread do Puma por ela travaria a API para quem só
  # quer entrar. Quem espera é a tela, avisada pelo `AgentChannel`.
  #
  # A regra do dinheiro é a de sempre: o crédito foi **reservado** pelo
  # controlador (para o "sem saldo" ainda ser um status HTTP de verdade) e é
  # **estornado** aqui se nada útil saiu — pergunta e falha não se cobram.
  class Run
    # Quantos turnos anteriores viajam no contexto. O suficiente para "agora
    # deixa mais escuro" fazer sentido, sem carregar um mês de conversa a cada
    # chamada.
    HISTORY_LIMIT = 8

    CACHE_CONTROL = { type: "ephemeral" }.freeze

    def initialize(turn, chat: Ai::Chat.new)
      @turn = turn
      @chat = chat
      @conversation = turn.conversation
      @brand = @conversation.brand_core
      @usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      @cost = 0
      # O modelo que **respondeu**, não o que pedimos: se um dia houver
      # fallback, a conta tem que bater com quem de fato trabalhou.
      @model = self.class.model
    end

    def self.model
      ENV.fetch("AGENT_MODEL", "claude-opus-5")
    end

    def call
      tokens = Engines::Tokens.new(@brand)
      messages = history(tokens) + [ { role: "user", content: request_text(@turn) } ]

      answer = ask(tokens, messages)
      plan = Plan.call(answer.text, tokens: tokens, limit: wanted)

      # Uma segunda tentativa, com o erro no contexto. Uma só: duas seriam
      # pagar duas vezes por um motor que o agente não entendeu.
      if !plan.ok? && plan.errors.any?
        Rails.logger.info("agent: corrigindo — #{plan.errors.join(' | ')}")
        messages += [
          { role: "assistant", content: answer.text },
          { role: "user", content: Prompts.repair(plan.errors) }
        ]
        answer = ask(tokens, messages)
        plan = Plan.call(answer.text, tokens: tokens, limit: wanted)
      end

      plan.ok? ? deliver(plan) : fail_with("agentInvalidPlan", plan.errors)
    rescue Engines::GenerationError => e
      fail_with(e.code, [ e.message ])
    rescue Ai::Chat::MissingKey
      Rails.logger.error("agent: ANTHROPIC_API_KEY ausente")
      fail_with("failed")
    rescue Ai::Chat::Failed => e
      Rails.logger.error("agent: #{e.message}")
      fail_with("failed")
    rescue StandardError => e
      Rails.logger.error("agent turn #{@turn.id}: #{e.class}: #{e.message[0, 200]}")
      fail_with("failed")
    end

    private

    def wanted
      @turn.kind == "adjust" ? 1 : Plan::MAX_VARIATIONS
    end

    def ask(tokens, messages)
      answer = @chat.answer(
        system: system_blocks(tokens),
        messages: messages,
        model: self.class.model,
        max_tokens: 8_000,
        # `medium` porque a tarefa é decisão estruturada sobre um catálogo
        # pequeno, não pesquisa: `high` custou mais sem escolher melhor.
        effort: "medium"
      )
      account(answer)
      answer
    end

    def account(answer)
      @model = answer.model.presence || @model
      @usage = @usage.merge(answer.usage) { |_key, a, b| a + b }
      @cost += Pricing.micro_usd(answer.model, answer.usage)
    end

    # A ordem importa: o cache casa por prefixo. As regras e o catálogo são
    # iguais para toda a plataforma (primeiro ponto); a ficha da marca é igual
    # para a marca (segundo). Só o pedido, que muda sempre, fica nas mensagens.
    def system_blocks(tokens)
      [
        { type: "text", text: Prompts.system },
        { type: "text", text: Prompts.catalog_block, cache_control: CACHE_CONTROL },
        { type: "text", text: Prompts.brand_block(BrandBrief.new(tokens)), cache_control: CACHE_CONTROL }
      ]
    end

    # Os turnos anteriores, remontados. Determinístico de propósito (a data sai
    # do `created_at` do turno, não de agora): remontar diferente a cada
    # chamada jogaria fora o cache do prefixo.
    def history(tokens)
      @conversation.turns
        .where.not(id: @turn.id)
        .where(status: %w[answered question])
        .chronological
        .last(HISTORY_LIMIT)
        .flat_map { |turn|
          [
            { role: "user", content: request_text(turn) },
            { role: "assistant", content: JSON.generate(turn.plan.presence || { "question" => turn.question }) }
          ]
        }
    end

    def request_text(turn)
      now = turn.created_at || Time.current
      attachments = Array(turn.attachments)
      case turn.kind
      when "adjust" then Prompts.adjust(turn.prompt, base: base_for(turn), now: now, attachments: attachments)
      when "vary" then Prompts.vary(base: base_for(turn), count: Plan::MAX_VARIATIONS, now: now)
      else Prompts.create(turn.prompt, count: Plan::MAX_VARIATIONS, now: now, attachments: attachments)
      end
    end

    # A peça de onde o ajuste partiu, na forma que o agente devolveu. Vem do
    # `plan` do turno que a gerou; se a peça foi apagada, o ajuste vira um
    # pedido comum em vez de quebrar.
    def base_for(turn)
      piece = turn.base_piece_id && Piece.find_by(id: turn.base_piece_id)
      return { "aviso" => "a peça de origem não existe mais" } unless piece

      {
        "engineId" => piece.engine_id,
        "format" => piece.format,
        "title" => piece.title,
        "values" => piece.values
      }
    end

    def deliver(plan)
      return answer_question(plan.question) if plan.question?

      variations = ActiveRecord::Base.transaction do
        plan.variations.map { |variation| create_piece(variation) }
      end

      variations.each { |entry| RenderPieceJob.perform_later(entry["pieceId"]) }

      finish(status: "answered", plan: { "question" => nil, "variations" => variations })
    end

    def create_piece(variation)
      piece = @turn.organization.pieces.create!(
        brand_core: @brand,
        account: @turn.account,
        agent_turn: @turn,
        engine_id: variation.engine_id,
        format: variation.format,
        title: variation.title,
        values: variation.values
      )
      variation.as_json.merge("pieceId" => piece.id)
    end

    # Faltou um fato e o agente perguntou em vez de inventar. Isso é acerto,
    # não erro — mas não é entrega: o crédito volta.
    def answer_question(question)
      refund!
      finish(status: "question", question: question, plan: { "question" => question, "variations" => [] })
    end

    def fail_with(code, details = [])
      refund!
      Rails.logger.warn("agent turn #{@turn.id} falhou (#{code}): #{details.join(' | ')}") if details.any?
      finish(status: "failed", error: { "code" => code, "details" => details.first(10) })
    end

    def refund!
      return if @turn.credits_charged.zero?

      @turn.organization.refund_credits!(@turn.credits_charged)
      @turn.credits_charged = 0
    end

    def finish(status:, plan: nil, question: nil, error: nil)
      @turn.update!(
        status: status,
        plan: plan || {},
        question: question,
        error: error,
        model: @model,
        usage: @usage,
        cost_micro_usd: @cost,
        credits_charged: @turn.credits_charged
      )
      @conversation.touch_turn!
      broadcast
      @turn
    end

    def broadcast
      AgentChannel.broadcast_to(@turn.organization, AgentTurnSerializer.event(@turn.reload))
    end
  end
end
