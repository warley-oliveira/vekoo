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

    # Quantas idas ao modelo um turno pode fazer com ferramenta no meio. A
    # ferramenta tem o próprio limite (`ImageTool::MAX_CALLS`); este é o
    # cinto de segurança para um laço que não termina.
    MAX_ROUNDS = 4

    # `references`: força o modo da busca de referências neste turno (o teste
    # lado a lado gera o mesmo pedido com `"on"` e com `"off"`); nulo segue o
    # interruptor. `image_tool: false` tira a ferramenta de foto — no teste,
    # para a foto não decidir a disputa.
    def initialize(turn, chat: Ai::Chat.new, references: nil, image_tool: true)
      @turn = turn
      @references_mode = references
      @chat = chat
      @conversation = turn.conversation
      @brand = @conversation.brand_core
      @usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      @cost = 0
      # O modelo que **respondeu**, não o que pedimos: se um dia houver
      # fallback, a conta tem que bater com quem de fato trabalhou.
      @model = self.class.model
      @image_tool = ImageTool.new(turn, on_change: -> { broadcast }) if image_tool && ImageTool.available?
    end

    def self.model
      ENV.fetch("AGENT_MODEL", "claude-opus-5")
    end

    def call
      describe_attachments
      tokens = Engines::Tokens.new(@brand)
      @references = find_references
      messages = history(tokens) + [ { role: "user", content: current_request } ]

      answer, messages = converse(tokens, messages)
      plan = plan_from(answer)

      # Uma segunda tentativa, com o erro no contexto. Uma só: duas seriam
      # pagar duas vezes por um motor que o agente não entendeu.
      if !plan.ok? && plan.errors.any?
        Rails.logger.info("agent: corrigindo — #{plan.errors.join(' | ')}")
        messages += [
          { role: "assistant", content: answer.content.presence || answer.text },
          { role: "user", content: Prompts.repair(plan.errors) }
        ]
        answer, = converse(tokens, messages)
        plan = plan_from(answer)
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

    def plan_from(answer)
      Plan.call(
        answer.text, brand_core: @brand, request_text: @turn.prompt, limit: wanted, generated: @turn.generated_asset_ids,
        references: injected_references? ? @references[:brief].aliases : {}
      )
    end

    # Os padrões do banco de referências para este pedido (Fase 3), conforme o
    # interruptor (`References::Retriever.mode`). Só no pedido novo e no "mais
    # variações": o ajuste mexe numa peça que já tem forma. Falha aqui nunca
    # derruba o turno — a peça sai como saía antes.
    # A foto anexada agora pode ainda estar sem descrição (o job do envio corre
    # junto): sem ela, nem a ficha da marca nem a busca sabem o que a foto
    # mostra. Uma chamada curta, só nesse caso.
    def describe_attachments
      @brand.assets.where(id: Array(@turn.attachments), description: nil).find_each { |asset| DescribeBrandAsset.call(asset) }
    end

    def find_references
      mode = @references_mode || References::Retriever.mode
      return if mode == "off" || @turn.kind == "adjust"

      query, exclude = reference_query
      return if query.blank?

      result = References::Retriever.call(@brand, query, exclude_ids: exclude)
      @cost += result.intent.cost_micro_usd
      { mode: mode, result: result, brief: References::AgentBrief.new(result.cards) }
    rescue StandardError => e
      Rails.logger.warn("agent turn #{@turn.id}: busca de referências falhou — #{e.class}: #{e.message.to_s.first(160)}")
      nil
    end

    # O texto que a busca lê. No "mais variações", o pedido que criou a peça
    # de origem — sem os padrões que ela já seguiu, para vir forma nova.
    def reference_query
      return [ @turn.prompt, [] ] unless @turn.kind == "vary"

      piece = @turn.base_piece_id && Piece.find_by(id: @turn.base_piece_id)
      return [ nil, [] ] unless piece

      [ piece.agent_turn&.prompt.presence || piece.title, piece.reference_ids ]
    end

    def injected_references?
      @references.present? && @references[:mode] == "on" && !@references[:brief].empty?
    end

    # O pedido de agora. Com padrões de referência, eles vêm antes, num bloco à
    # parte, e o pedido ganha o terceiro ponto de cache: a volta da ferramenta
    # de foto e a correção releem tudo isso do cache. O histórico nunca leva
    # os padrões — o turno antigo volta só com o pedido e o plano.
    def current_request
      text = request_text(@turn)
      return text unless injected_references?

      [
        { type: "text", text: @references[:brief].text },
        { type: "text", text: text, cache_control: CACHE_CONTROL }
      ]
    end

    # Pergunta ao modelo e, enquanto ele pedir ferramenta, roda e devolve o
    # resultado — o assistente vai de volta **como veio** (pensamento e
    # pedidos de ferramenta juntos) e todos os resultados num turno só.
    # Devolve a resposta final e a conversa até ela.
    def converse(tokens, messages)
      MAX_ROUNDS.times do
        answer = ask(tokens, messages)
        return [ answer, messages ] unless answer.tool_use? && @image_tool

        results = answer.tool_uses.map { |tool_use| @image_tool.call(tool_use) }
        messages += [
          { role: "assistant", content: answer.content },
          { role: "user", content: results }
        ]
      end
      raise Ai::Chat::Failed, "laço de ferramentas não terminou em #{MAX_ROUNDS} voltas"
    end

    def ask(tokens, messages)
      answer = @chat.answer(
        # Montado **uma vez** por turno e nunca mais mexido: a foto que a
        # ferramenta cria entra na ficha da marca, e uma ficha diferente na
        # segunda volta mudaria o prefixo — o pensamento da primeira volta é
        # assinado contra ele e seria recusado. A foto nova chega ao modelo
        # pelo resultado da ferramenta; a ficha atualizada fica para o
        # próximo pedido.
        system: @system ||= system_blocks(tokens),
        messages: messages,
        model: self.class.model,
        max_tokens: 8_000,
        # `medium` porque a tarefa é decisão estruturada sobre um catálogo
        # pequeno, não pesquisa: `high` custou mais sem escolher melhor.
        effort: "medium",
        # Sem gerador configurado a ferramenta nem aparece: o agente compõe
        # com as fotos que a marca já tem, como antes.
        tools: @image_tool ? [ ImageTool::DEFINITION ] : nil
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

    # A peça de onde o ajuste partiu, como está **agora** (com o que a pessoa
    # já editou), na forma compacta que o agente escreve. Se a peça foi
    # apagada — ou é legada, sem documento —, o ajuste vira um pedido comum.
    def base_for(turn)
      piece = turn.base_piece_id && Piece.find_by(id: turn.base_piece_id)
      return { "aviso" => "a peça de origem não existe mais" } unless piece&.document

      PieceDocument::Compact.call(piece.document, title: piece.title)
    end

    def deliver(plan)
      return answer_question(plan.question) if plan.question?
      return deliver_images if plan.only_images?

      variations = ActiveRecord::Base.transaction do
        plan.variations.map { |variation| create_piece(variation) }
      end

      variations.each { |entry| RenderPieceJob.perform_later(entry["pieceId"], PieceRenderers.default) }

      finish(status: "answered", plan: { "question" => nil, "variations" => variations, "images" => images_summary })
    end

    # A pessoa pediu foto, não peça: o resultado são as fotos que a
    # ferramenta criou. Cada foto já cobrou o seu crédito; o do pedido volta —
    # pedir uma foto pela conversa custa o mesmo que pedir direto.
    def deliver_images
      refund!
      finish(status: "answered", plan: { "question" => nil, "variations" => [], "images" => images_summary, "onlyImages" => true })
    end

    # As fotos criadas neste turno, com o que o agente disse que elas são — é
    # isso que volta ao contexto no histórico ("usa aquela foto de novo").
    def images_summary
      @turn.step_list.select { |step| step["status"] == "done" }.flat_map { |step|
        Array(step["assetIds"]).map { |id| { "assetId" => id, "caption" => step["caption"] } }
      }
    end

    # A peça nasce em rascunho, com o documento como primeira versão. No
    # `plan` do turno fica a forma compacta — é ela que volta ao contexto do
    # modelo no histórico, sem o peso do documento inteiro.
    def create_piece(variation)
      piece = @turn.organization.pieces.create!(
        brand_core: @brand,
        account: @turn.account,
        agent_turn: @turn,
        format: variation.format,
        title: variation.title,
        status: "draft",
        brand_core_version_id: variation.document["brandCoreVersionId"],
        reference_ids: variation.reference_ids.to_a
      )
      piece.record_version!(variation.document, source: "generation", summary: @turn.prompt, account: @turn.account)
      PieceDocument::Compact.call(piece.document, title: piece.title).merge("why" => variation.why, "pieceId" => piece.id)
    end

    # Faltou um fato e o agente perguntou em vez de inventar. Isso é acerto,
    # não erro — mas não é entrega: o crédito volta.
    def answer_question(question)
      refund!
      finish(status: "question", question: question, plan: { "question" => question, "variations" => [], "images" => images_summary })
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
        credits_charged: @turn.credits_charged,
        offered_reference_ids: @references ? @references[:result].cards.map(&:id) : []
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
