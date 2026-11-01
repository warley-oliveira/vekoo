module References
  # Os posts de uma conta ordenados pelo que performaram **em relação à própria
  # conta**: engajamento relativo = (curtidas + comentários) / mediana de
  # curtidas + comentários dos posts puxados. Conta grande e conta pequena
  # ficam na mesma régua.
  #
  # Post com menos de `MIN_AGE` fica fora da mediana **e** da lista: ainda não
  # acumulou engajamento, e entraria como fracasso. Post com curtida oculta (o
  # Meta não devolve o número) fica fora da mediana e aparece sem métrica.
  # Vídeo entra marcado como análise parcial — o modelo vê só a capa.
  module InstagramRanking
    MIN_AGE = 7.days

    Candidate = Struct.new(:media, :engagement, :relative, :partial, keyword_init: true)
    Result = Struct.new(:median, :eligible, :candidates, keyword_init: true)

    module_function

    def call(media, now: Time.current)
      eligible = media.select { |item| item.posted_at && item.posted_at <= now - MIN_AGE }
      measured = eligible.filter_map { |item| engagement(item) }
      median = median(measured)

      candidates = eligible.map { |item|
        total = engagement(item)
        Candidate.new(
          media: item, engagement: total,
          relative: (total.fdiv(median).round(2) if total && median&.positive?),
          partial: partial?(item)
        )
      }
      sorted = candidates.sort_by { |candidate| [ candidate.relative ? 0 : 1, -(candidate.relative || 0), -candidate.media.posted_at.to_i ] }
      Result.new(median: median, eligible: eligible.length, candidates: sorted)
    end

    def engagement(item)
      item.like_count + item.comments_count if item.like_count && item.comments_count
    end

    def median(values)
      return nil if values.empty?

      sorted = values.sort
      middle = sorted.length / 2
      sorted.length.odd? ? sorted[middle].to_f : (sorted[middle - 1] + sorted[middle]) / 2.0
    end

    # Vídeo — ou carrossel com vídeo no meio — é análise pela capa.
    def partial?(item)
      item.video? || item.children.any?(&:video?)
    end
  end
end
