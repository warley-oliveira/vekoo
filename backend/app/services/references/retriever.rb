require "digest"

module References
  # A busca de referências da geração (Fase 3): para o pedido de uma marca, até
  # três cards publicados que o agente pode usar como padrão — um por variação.
  #
  # Calibrada com os 60 cards da onda 1 (spec, "Fase 3 — plano aprovado"):
  #   - filtro duro: publicado, replicabilidade ≥ 2, com vetor; formato só
  #     quando o pedido nomeia;
  #   - pontos: nicho +3, estilo +2 (principal) ou +1 (secundário), objetivo
  #     +2, semelhança 0–3 relativa ao pedido, engajamento +1 com mediana de
  #     verdade, −2 por exigência que a marca comprovadamente não cumpre;
  #   - mínimo por regra, não por número: card do nicho da marca precisa bater
  #     objetivo ou estilo; de outro nicho, estilo **e** objetivo — e outro
  #     nicho só entra quando o da marca tem menos de 3 cards publicados;
  #   - diversidade: 1 card por conta, 1 por gancho, nenhum quase igual a um
  #     já escolhido.
  #
  # O cosseno não serve de piso (o melhor card de um nicho sem card nenhum
  # passa de vários com card): a semelhança só ordena dentro do pedido.
  #
  # Nunca derruba a geração. Sem Vertex, com 429 ou lento, a busca segue só
  # pelas colunas; sem marca publicada ou sem card que passe, devolve vazio — e
  # a peça sai como saía antes.
  class Retriever
    MAX_PICKS = 3
    # Cosseno a partir do qual dois cards contam como o mesmo padrão (entre
    # contas diferentes a onda 1 chegou a 0,968).
    NEAR_DUPLICATE = 0.95
    # Abaixo disso o nicho da marca é raso demais e cards de outros nichos
    # completam — só com estilo e objetivo batendo.
    MIN_NICHE_CARDS = 3
    # Engajamento só conta com mediana de verdade: os maiores relativos da
    # onda 1 vinham de contas com mediana abaixo de 50 interações.
    ENGAGEMENT_MEDIAN = 100
    ENGAGEMENT_RELATIVE = 3
    QUERY_TIMEOUT = 2
    QUERY_CACHE = 1.day

    POINTS = { niche: 3, primary: 2, secondary: 1, objective: 2, similarity: 3, engagement: 1, missing: -2 }.freeze
    # As exigências que a falta de foto prova que a marca não cumpre.
    PHOTO_PROOF = %w[product_photo space].freeze

    # O interruptor da busca na geração (`REFERENCES_IN_GENERATION`): `off`
    # não busca; `shadow` busca e grava no turno o que ofereceria, sem mandar
    # ao agente; `on` manda. Desligado até o teste lado a lado decidir.
    MODES = %w[off shadow on].freeze

    def self.mode
      value = ENV.fetch("REFERENCES_IN_GENERATION", "off")
      MODES.include?(value) ? value : "off"
    end

    # `points`: o que somou cada critério (para a curadoria conferir);
    # `missing`: as exigências do card que a marca comprovadamente não cumpre.
    Pick = Struct.new(:card, :points, :total, :cosine, :missing, keyword_init: true)

    # `has`: o que a busca sabe que a marca tem; `similarity`: se o vetor do
    # pedido entrou na conta.
    Result = Struct.new(:picks, :intent, :niche, :archetypes, :has, :similarity, :candidates, keyword_init: true) do
      def self.empty(intent: Intent::Result.empty)
        new(picks: [], intent: intent, niche: nil, archetypes: {}, has: {}, similarity: false, candidates: 0)
      end

      def cards = picks.map(&:card)
    end

    def self.call(...) = new(...).call

    # `exclude_ids`: cards que já serviram nesta conversa (o "mais variações"
    # pede outros padrões);
    # `scope`: de onde a busca escolhe — só publicados, salvo na prévia da
    # curadoria; `intent` e `embedder` entram prontos nas specs.
    def initialize(brand_core, text, exclude_ids: [], scope: ReferenceCard.published, intent: nil, embedder: :default)
      @brand = brand_core
      @text = text.to_s.strip
      @exclude_ids = Array(exclude_ids)
      @scope = scope
      @intent = intent
      @embedder = embedder == :default ? (Ai::Embeddings.new if Ai::Embeddings.available?) : embedder
    end

    def call
      return Result.empty unless @brand&.published? && @text.present?

      intent = @intent || Intent.call(@text)
      niche = @brand.generation_niche
      archetypes = brand_archetypes
      has = brand_has(intent)
      pool = pool_for(niche, intent)
      return Result.new(picks: [], intent: intent, niche: niche, archetypes: archetypes, has: has, similarity: false, candidates: 0) if pool.empty?

      vectors = pool.to_h { |card| [ card.id, unit(card.embedding) ] }
      query = query_vector
      cosines = query ? pool.to_h { |card| [ card.id, dot(query, vectors[card.id]) ] } : {}
      relative = relative_similarity(cosines)

      scored = pool.filter_map { |card|
        score(card, niche: niche, archetypes: archetypes, intent: intent, has: has, cosine: cosines[card.id], similarity: relative[card.id])
      }
      picks = diversify(scored.sort_by { |pick| [ -pick.total, -(pick.cosine || 0), pick.card.id ] }, vectors)
      Result.new(picks: picks, intent: intent, niche: niche, archetypes: archetypes, has: has, similarity: !query.nil?, candidates: pool.size)
    end

    private

    # O estilo publicado ou, na marca de antes do campo, o deduzido do que ela
    # publicou (`BrandCore#generation_archetypes`).
    def brand_archetypes
      archetypes = @brand.generation_archetypes
      { primary: archetypes["primary"].presence, secondary: archetypes["secondary"].presence }
    end

    # O que dá para saber que a marca tem — e, mais importante, o que dá para
    # saber que ela **não** tem, porque é isso que desconta. Promoção se
    # comprova pela oferta com preço; produto e espaço, pela foto enviada que
    # os mostra (`DescribeBrandAsset`). Com todas as fotos descritas, a falta
    # prova; com alguma ainda sem descrição, não se sabe e não desconta.
    # Pessoa da marca, cliente e evento nunca descontam: depoimento escrito ou
    # evento sem foto existem — o card leva a exigência e o agente pergunta ou
    # adapta. O próprio pedido trazendo vale para todos.
    def brand_has(intent)
      offers = BrandCore::Schema.complete(@brand.published_document).dig("offers", "items").to_a
      has = { "promotion" => intent.brings.include?("promotion") || offers.any? { |offer| offer["price"].present? } }
      photos = @brand.assets.where(kind: "photo", generated: false)
      shown = photos.pluck(:shows).flatten
      undescribed = photos.where(description: nil).exists?
      PHOTO_PROOF.each do |code|
        if intent.brings.include?(code) || shown.include?(code)
          has[code] = true
        elsif !undescribed
          has[code] = false
        end
      end
      has
    end

    def pool_for(niche, intent)
      scope = @scope.where("reference_cards.replicability >= 2").where.not(embedding: nil)
      scope = scope.where.not(id: @exclude_ids) if @exclude_ids.any?
      scope = scope.where(format: intent.format) if intent.format
      cards = scope.to_a
      same = niche ? cards.select { |card| card.niche == niche } : []
      same.size >= MIN_NICHE_CARDS ? same : cards
    end

    # Nil quando o vetor do pedido não sai: a busca segue pelas colunas.
    def query_vector
      return unless @embedder

      key = "references:query:#{Ai::Embeddings.model}:#{Digest::SHA256.hexdigest(@text)}"
      cached = Rails.cache.read(key)
      return unit(cached) if cached

      vector = @embedder.embed(@text, task: :query, timeout: QUERY_TIMEOUT)
      Rails.cache.write(key, vector, expires_in: QUERY_CACHE)
      unit(vector)
    rescue StandardError => e
      Rails.logger.warn("reference retriever: sem vetor do pedido — #{e.class}: #{e.message.to_s.first(160)}")
      nil
    end

    # 0 na mediana dos candidatos, 3 no melhor: o cosseno cru fica numa faixa
    # estreita (o 1º e o 10º diferem uns 0,04) e só vale como ordem.
    def relative_similarity(cosines)
      return {} if cosines.empty?

      sorted = cosines.values.sort
      middle = sorted[(sorted.size - 1) / 2]
      top = sorted.last
      return cosines.transform_values { 0.0 } if top <= middle

      cosines.transform_values { |cosine| (POINTS[:similarity] * ((cosine - middle) / (top - middle)).clamp(0, 1)).round(2) }
    end

    def score(card, niche:, archetypes:, intent:, has:, cosine:, similarity:)
      same_niche = niche.present? && card.niche == niche
      style = card.archetypes.first
      style_points =
        if style && style == archetypes[:primary] then POINTS[:primary]
        elsif style && style == archetypes[:secondary] then POINTS[:secondary]
        else 0
        end
      objective = intent.objective.present? && card.objective == intent.objective
      return unless same_niche ? (objective || style_points.positive?) : (objective && style_points.positive?)

      missing = card.requires.select { |need| has.key?(need) && !has[need] }
      points = {
        niche: same_niche ? POINTS[:niche] : 0,
        archetype: style_points,
        objective: objective ? POINTS[:objective] : 0,
        similarity: similarity || 0,
        engagement: engaging?(card) ? POINTS[:engagement] : 0,
        missing: missing.size * POINTS[:missing]
      }
      Pick.new(card: card, points: points, total: points.values.sum.round(2), cosine: cosine&.round(3), missing: missing)
    end

    def engaging?(card)
      card.analysis.dig("metrics", "baselineMedian").to_f >= ENGAGEMENT_MEDIAN && card.relative_engagement.to_f >= ENGAGEMENT_RELATIVE
    end

    # Em ordem de pontos: uma conta, um gancho, nenhum padrão repetido.
    def diversify(ranked, vectors)
      ranked.each_with_object([]) do |pick, chosen|
        break chosen if chosen.size == MAX_PICKS

        card = pick.card
        next if chosen.any? { |other| account(other.card) == account(card) }
        next if card.hook_type && chosen.any? { |other| other.card.hook_type == card.hook_type }
        next if chosen.any? { |other| dot(vectors[other.card.id], vectors[card.id]) >= NEAR_DUPLICATE }

        chosen << pick
      end
    end

    # Card sem @ (print manual) é uma conta só dele.
    def account(card) = card.source["channel"].presence || card.id

    def unit(vector)
      values = vector.to_a.map(&:to_f)
      norm = Math.sqrt(values.sum { |value| value * value })
      norm.zero? ? values : values.map { |value| value / norm }
    end

    def dot(a, b)
      sum = 0.0
      a.each_with_index { |value, index| sum += value * b[index] }
      sum
    end
  end
end
