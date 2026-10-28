module Agent
  # A ferramenta `generate_image`: o agente de criação pede uma foto ao
  # gerador (Nano Banana no Vertex) no meio do pedido e recebe o id do ativo
  # para usar no slot `image` — ou para entregar a foto sozinha, quando foi
  # isso que a pessoa pediu.
  #
  # Cada chamada é um `ImageGeneration` (`origin: "agent"`) ligado ao turno:
  # mesma conta de crédito (reserva por imagem, estorno do que não sair),
  # mesmo teto de OPEX e as fotos entram na marca como qualquer outra. O que
  # muda é quem decide pedir: o agente, não a pessoa.
  #
  # A trilha vai ao vivo para a tela: cada chamada vira um passo em
  # `turn.steps` (rodando → pronto/falhou), avisado pelo `AgentChannel`.
  class ImageTool
    NAME = "generate_image"
    # Por pedido. O suficiente para três opções de foto, ou uma foto e uma
    # segunda tentativa — sem um pedido virar uma sessão de fotos.
    MAX_IMAGES = 4
    MAX_CALLS = 2
    # O agente vê a foto que saiu (para decidir enquadramento, fundo e copy)
    # em tamanho de miniatura: o bastante para julgar, sem pesar no contexto.
    PREVIEW_PX = 512

    DEFINITION = {
      name: NAME,
      description: <<~TEXT.squish,
        Cria uma foto nova com o gerador de imagens e a guarda nas fotos da marca.
        Devolve o id de cada foto (use no slot `image` ou em `background.assetId`)
        e a própria foto, para você conferir antes de compor.
        Use quando a peça precisa de foto e nenhuma de `ativosDisponiveis` mostra o
        assunto, ou quando a pessoa pede uma foto ou imagem. Não use quando a pessoa
        anexou uma foto para ir na peça como está.
        Escreva `prompt` em português, concreto: o assunto, o lugar, a luz, o
        enquadramento e o clima — e, se o texto da peça vai por cima da foto, onde
        deixar espaço livre. Nunca peça texto, letra, número, preço ou logotipo dentro
        da foto, nem pessoa real identificável. Custa créditos por foto: para uma peça,
        uma foto (`count: 1`) basta e serve a todas as variações.
      TEXT
      input_schema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "A descrição da foto, em português, de 1 a 4 frases." },
          caption: { type: "string", description: "Rótulo curto (até 60 caracteres) que a pessoa vê enquanto a foto sai, ex.: \"pão de queijo saindo do forno\"." },
          aspectRatio: { type: "string", enum: ImageGeneration::RATIOS, description: "4:5 para post do feed e carrossel, 1:1 para quadrado, 9:16 para story." },
          count: { type: "integer", minimum: 1, maximum: 4, description: "Quantas opções. 1 para ir numa peça; 2 a 4 só quando a pessoa pediu fotos para escolher." },
          referenceAssetId: { type: "string", description: "Opcional: id de uma foto da marca para servir de referência (o produto, o lugar)." }
        },
        required: %w[prompt caption aspectRatio count],
        additionalProperties: false
      }
    }.freeze

    def self.available? = Ai::GeminiImage.available?

    def initialize(turn, on_change:)
      @turn = turn
      @brand = turn.conversation.brand_core
      @on_change = on_change
      @calls = 0
      @images = 0
    end

    # Roda um pedido de ferramenta e devolve o `tool_result` (conteúdo e
    # `is_error`). Nunca levanta: o erro volta ao agente, que segue sem foto.
    def call(tool_use)
      input = tool_use[:input]
      return refuse(tool_use, "ferramenta desconhecida: #{tool_use[:name]}") unless tool_use[:name] == NAME
      return refuse(tool_use, "limite de fotos deste pedido atingido — siga com as fotos que já tem") if @calls >= MAX_CALLS || @images >= MAX_IMAGES

      prompt = input["prompt"].to_s.strip
      return refuse(tool_use, "`prompt` veio vazio") if prompt.empty?

      ratio = ImageGeneration::RATIOS.include?(input["aspectRatio"]) ? input["aspectRatio"] : "4:5"
      count = input["count"].to_i.clamp(1, MAX_IMAGES - @images)
      reference = input["referenceAssetId"].presence
      if reference && !@brand.assets.exists?(id: reference, kind: "photo")
        return refuse(tool_use, "`referenceAssetId` não é uma foto desta marca — use um id de `ativosDisponiveis` ou omita")
      end

      @calls += 1
      step = {
        "id" => tool_use[:id], "kind" => "image", "status" => "running",
        "caption" => input["caption"].to_s.squish.first(80).presence || prompt.first(60),
        "aspectRatio" => ratio, "count" => count, "referenceAssetId" => reference,
        "assetIds" => [], "error" => nil, "startedAt" => epoch_ms, "finishedAt" => nil
      }

      generation = start(prompt, ratio, count, reference)
      unless generation.is_a?(ImageGeneration)
        record(step.merge("status" => "failed", "error" => generation, "finishedAt" => epoch_ms))
        return refuse(tool_use, generation == "noCredits" ? "a pessoa não tem créditos para fotos novas — componha sem foto criada" : "o gerador está indisponível — componha sem foto criada")
      end

      record(step.merge("generationId" => generation.id))
      Images::Generate.new(generation).call
      @images += generation.asset_ids.length

      if generation.status == "done"
        record(step.merge("generationId" => generation.id, "status" => "done", "assetIds" => generation.asset_ids, "finishedAt" => epoch_ms))
        success(tool_use, generation)
      else
        code = generation.error&.dig("code") || "failed"
        record(step.merge("generationId" => generation.id, "status" => "failed", "error" => code, "finishedAt" => epoch_ms))
        refuse(tool_use, code == "blocked" ? "o gerador recusou esta descrição — tente outra, mais neutra, ou siga sem foto" : "a foto não saiu — siga sem foto criada")
      end
    end

    private

    # Confere teto e saldo e reserva o crédito. Devolve a geração ou o código
    # do motivo por que não saiu.
    def start(prompt, ratio, count, reference)
      organization = @turn.organization
      Agent::Budget.check!(organization)
      credits = count * CatalogSerializer::AI_COSTS[:image]
      organization.reserve_credits!(credits)
      @brand.image_generations.create!(
        organization: organization, account: @turn.account, agent_turn: @turn,
        prompt: prompt.first(ImageGeneration::PROMPT_MAX), aspect_ratio: ratio, count: count,
        reference_asset_id: reference, origin: "agent", credits_charged: credits
      )
    rescue Organization::NoCreditsError
      "noCredits"
    rescue Agent::Budget::CapReached
      "costCapReached"
    end

    def record(step)
      @turn.put_step!(step)
      @on_change.call
    end

    # O id de cada foto, em texto, e a própria foto em miniatura — o agente
    # decide a composição olhando o que saiu, não o que pediu.
    def success(tool_use, generation)
      assets = generation.assets.with_attached_file.index_by(&:id)
      ids = generation.asset_ids.select { |id| assets[id] }
      text = JSON.generate(
        "fotos" => ids.map { |id| { "id" => id } },
        "aviso" => ids.length < generation.count ? "#{generation.count - ids.length} das fotos pedidas não saiu" : nil
      )
      images = ids.filter_map { |id| preview(assets[id]) }
      { type: "tool_result", tool_use_id: tool_use[:id], content: [ { type: "text", text: text }, *images ] }
    end

    def refuse(tool_use, message)
      { type: "tool_result", tool_use_id: tool_use[:id], content: message, is_error: true }
    end

    def preview(asset)
      image = Vips::Image.thumbnail_buffer(asset.file.download, PREVIEW_PX)
      data = image.write_to_buffer(".jpg", Q: 80)
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: Base64.strict_encode64(data) } }
    rescue StandardError => e
      Rails.logger.warn("agent image preview #{asset.id}: #{e.class}")
      nil
    end

    def epoch_ms = (Time.current.to_f * 1000).to_i
  end
end
