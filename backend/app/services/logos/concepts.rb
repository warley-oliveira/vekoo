module Logos
  # O "cria pra mim" da logo, com símbolo: a direção de arte escreve quatro
  # prompts (figurativo, geométrico, monograma, emblema), o gerador desenha os
  # quatro ao mesmo tempo, cada símbolo é vetorizado e montado com o nome da
  # marca em dois arranjos. Cada arranjo vira uma logo da marca (claro +
  # escuro), como o logotipo tipográfico — a escolha, o resumo e a troca
  # depois funcionam igual. O símbolo em SVG vai junto na logo e vira o glifo
  # da marca quando ela é a escolhida (`adopt_symbol!`).
  #
  # Os símbolos chegam na ordem em que ficam prontos (`on_concept`); um que
  # falha (o gerador recusou, 429 depois das tentativas, vetor vazio) não
  # derruba os outros (`on_failure`). O logotipo só com o nome continua sendo
  # a opção grátis e a reserva.
  class Concepts
    DIRECTIONS = ArtDirection::DIRECTIONS
    ARRANGEMENTS = Lockup::ARRANGEMENTS

    Result = Struct.new(:logo_ids, :failed, :cost_micro_usd, keyword_init: true)

    def self.available? = Ai::Chat.available? && Ai::GeminiImage.available? && Vectorize.available?

    def self.image_cost = ENV.fetch("GEMINI_IMAGE_COST_MICRO_USD", "67000").to_i

    def initialize(brand_core, account:, chat: Ai::Chat.new, generator: Ai::GeminiImage.new, vectorizer: Vectorize.new,
      on_concept: ->(_direction, _logo_ids) { }, on_failure: ->(_direction) { })
      @brand = brand_core
      @account = account
      @chat = chat
      @generator = generator
      @vectorizer = vectorizer
      @on_concept = on_concept
      @on_failure = on_failure
    end

    def call
      direction = ArtDirection.new(@brand, chat: @chat).call
      cost = direction.cost_micro_usd
      logo_ids = []
      failed = []

      # O gerador demora (15–40 s) e devolve 429 de vez em quando: os quatro
      # saem juntos, e cada um é vetorizado e gravado quando chega.
      arrivals = Queue.new
      threads = direction.briefs.map { |brief|
        Thread.new do
          arrivals << [ brief, @generator.generate(prompt: brief.prompt, aspect_ratio: "1:1") ]
        rescue StandardError => e
          arrivals << [ brief, e ]
        end
      }

      direction.briefs.size.times do
        brief, image = arrivals.pop
        if image.is_a?(Exception)
          Rails.logger.warn("logo concept #{@brand.id} #{brief.direction}: #{image.class}: #{image.message.to_s.first(160)}")
          failed << brief.direction
          @on_failure.call(brief.direction)
          next
        end

        cost += self.class.image_cost
        ids = adopt(brief, image.image.data)
        if ids.empty?
          failed << brief.direction
          @on_failure.call(brief.direction)
        else
          logo_ids.concat(ids)
          @on_concept.call(brief.direction, ids)
        end
      end
      threads.each(&:join)

      Result.new(logo_ids: logo_ids, failed: failed, cost_micro_usd: cost)
    end

    # A logo escolhida carrega o símbolo: ele vira o glifo da marca (claro em
    # SVG, nas cores dele; escuro em PNG, com as cores para fundo escuro).
    def self.adopt_symbol!(brand_core, logo_id, account: nil)
      logo = brand_core.logos.find_logo(logo_id)
      svg = logo&.variant("light")&.meta.to_h["symbolSvg"]
      return if svg.blank?

      dark = Lockup.raster(Lockup.dark_svg(svg, brand_core), 1024).write_to_buffer(".png")
      files = { "light" => [ svg, "image/svg+xml", "svg" ], "dark" => [ dark, "image/png", "png" ] }
      files.each do |variant, (data, type, extension)|
        asset = brand_core.assets.new(
          organization: brand_core.organization, account: account, kind: "glyph", variant: variant,
          filename: "simbolo-#{variant}.#{extension}", content_type: type, byte_size: data.bytesize, generated: true,
          meta: { "origin" => "onboarding", "concept" => logo.variant("light").meta["concept"] }
        )
        asset.file.attach(io: StringIO.new(data), filename: asset.filename, content_type: type)
        asset.save!
        AnalyzeBrandAsset.call(asset, StringIO.new(data))
      end
      brand_core.assets.reset
    end

    private

    # Vetoriza, monta os dois arranjos e grava cada um como uma logo.
    def adopt(brief, data)
      symbol = @vectorizer.call(data)
      lockups = Lockup.new(@brand, symbol.svg).call
      concept_id = SecureRandom.uuid
      lockups.map { |arrangement, variants|
        concept = { "id" => concept_id, "direction" => brief.direction, "arrangement" => arrangement, "idea" => brief.idea }.compact
        attach(variants, concept, symbol.svg)
      }
    rescue Vectorize::Failed, Vips::Error => e
      Rails.logger.warn("logo concept #{@brand.id} #{brief.direction}: #{e.class}: #{e.message.to_s.first(160)}")
      []
    end

    def attach(variants, concept, svg)
      logo_id = SecureRandom.uuid
      variants.each do |variant, png|
        meta = { "origin" => "onboarding", "concept" => concept }
        meta["symbolSvg"] = svg if variant == "light"
        asset = @brand.assets.new(
          organization: @brand.organization, account: @account, kind: "logo", variant: variant,
          filename: "logo-#{concept['direction']}-#{concept['arrangement']}-#{variant}.png", content_type: "image/png",
          byte_size: png.bytesize, generated: true, logo_id: logo_id, meta: meta
        )
        asset.file.attach(io: StringIO.new(png), filename: asset.filename, content_type: "image/png")
        asset.save!
        AnalyzeBrandAsset.call(asset, StringIO.new(png))
      end
      @brand.assets.reset
      logo_id
    end
  end
end
