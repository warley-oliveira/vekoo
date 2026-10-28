module Images
  # Roda um `ImageGeneration`: pede as N imagens ao gerador em paralelo, guarda
  # cada uma como foto da marca e acerta a conta — devolve o crédito das que
  # não saíram. Falha limpa: o erro vira `generation.error` com código.
  class Generate
    def initialize(generation, client: Ai::GeminiImage.new)
      @generation = generation
      @client = client
      @brand = generation.brand_core
    end

    def call
      @generation.update!(status: "running", error: nil)
      # A referência sai do storage uma vez, antes das threads: elas só falam
      # com o gerador, nunca com o banco.
      references = reference
      prompt = Prompt.call(@brand, @generation.prompt, reference: references.any?)
      results = Array.new(@generation.count) {
        Thread.new { attempt(prompt, references) }
      }.map(&:value)

      images = results.grep(Ai::GeminiImage::Result)
      assets = images.map { |result| store(result) }
      cost = images.sum { cost_per_image }
      missing = @generation.count - assets.length
      refund(missing)

      error = assets.empty? ? failure(results) : nil
      @generation.update!(
        status: assets.empty? ? "failed" : "done",
        asset_ids: assets.map(&:id),
        model: images.first&.model || Ai::GeminiImage.model,
        cost_micro_usd: cost,
        error: error
      )
      broadcast if assets.any?
      @generation
    end

    private

    # Um erro de uma imagem não derruba as outras.
    def attempt(prompt, references)
      @client.generate(prompt: prompt, aspect_ratio: @generation.aspect_ratio, references: references)
    rescue Ai::GeminiImage::Blocked => e
      [ :blocked, e.message ]
    rescue Ai::GeminiImage::MissingKey
      [ :unavailable, nil ]
    rescue Ai::GeminiImage::Failed => e
      Rails.logger.warn("gerador de imagem: #{e.message}")
      [ :failed, e.message ]
    end

    def failure(results)
      codes = results.map { |result| result.is_a?(Array) ? result.first : :failed }
      code = %i[unavailable blocked].find { |c| codes.include?(c) } || :failed
      { "code" => code.to_s }
    end

    def reference
      return @reference if defined?(@reference)

      asset = @generation.reference_asset_id && @brand.assets.find_by(id: @generation.reference_asset_id, kind: "photo")
      @reference = asset ? [ { data: asset.file.download, mime_type: asset.content_type } ] : []
    end

    def store(result)
      ext = result.image.mime_type.to_s.include?("jpeg") ? "jpg" : "png"
      asset = @brand.assets.new(
        organization: @brand.organization, account: @generation.account, kind: "photo",
        filename: "gerada-#{@generation.id.first(8)}-#{SecureRandom.hex(3)}.#{ext}",
        content_type: result.image.mime_type.presence || "image/png", byte_size: result.image.data.bytesize,
        generated: true, meta: { "origin" => "generated", "generationId" => @generation.id, "prompt" => @generation.prompt.first(300) }
      )
      asset.file.attach(io: StringIO.new(result.image.data), filename: asset.filename, content_type: asset.content_type)
      asset.save!
      AnalyzeBrandAsset.call(asset, StringIO.new(result.image.data))
      asset
    end

    # A página do modelo no Vertex não traz o preço por imagem: o custo vem de
    # env, em micro-dólares, e entra no teto mensal da Vekoo. O padrão (~US$
    # 0,067 por imagem 1K do Nano Banana 2) é de tabelas de terceiros.
    def cost_per_image
      ENV.fetch("GEMINI_IMAGE_COST_MICRO_USD", "67000").to_i
    end

    def refund(missing)
      return unless missing.positive?

      amount = missing * CatalogSerializer::AI_COSTS[:image]
      @generation.organization.refund_credits!(amount)
      @generation.update!(credits_charged: [ @generation.credits_charged - amount, 0 ].max)
    end

    def broadcast
      BrandCoreChannel.broadcast_to(
        @brand.organization,
        BrandCoreSerializer.event(@brand.reload, event: "assetsChanged", account: @generation.account)
      )
    end
  end
end
