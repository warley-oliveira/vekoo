module References
  # Os lotes de importação do Instagram: criar (as contas entram na fila, uma
  # chamada cada), escolher candidatos (viram card em rascunho e entram na
  # mesma análise da Fase 2) e limpar o que passou de 30 dias.
  module Imports
    # `code`: handlesRequired | tooManyHandles | invalidHandles |
    # instagramNotConfigured | instagramTokenInvalid | nothingSelected
    class Invalid < StandardError
      attr_reader :code, :details

      def initialize(code, details = nil)
        @code = code
        @details = details
        super(code)
      end
    end

    # Quantos candidatos viram card num clique — cada um custa uma análise.
    MAX_SELECTION = 50

    module_function

    def create!(text:, niche:, size:, curated_by:)
      valid, invalid = parse(text)
      raise Invalid, "handlesRequired" if valid.empty? && invalid.empty?
      raise Invalid.new("invalidHandles", invalid) if invalid.any?
      raise Invalid.new("tooManyHandles", { max: ReferenceImport::MAX_ACCOUNTS }) if valid.length > ReferenceImport::MAX_ACCOUNTS
      raise Invalid, "instagramNotConfigured" unless InstagramGraph::Client.configured?
      raise Invalid, "instagramTokenInvalid" if InstagramGraph::TokenStatus.call[:state] == "invalid"

      purge!
      import = ReferenceImport.transaction do
        ReferenceImport.create!(curated_by: curated_by, niche: niche.presence, size: size.presence).tap do |batch|
          valid.each { |username| batch.accounts.create!(username: username) }
        end
      end
      import.accounts.each { |account| ImportReferenceAccountJob.perform_later(account.id) }
      import
    end

    # "@padoca, instagram.com/outra/ e terceira" → os @ válidos e os que não
    # são @ de Instagram, cada um uma vez.
    def parse(text)
      tokens = text.to_s.split(/[\s,;]+/).map { |token|
        token.sub(%r{\Ahttps?://(www\.)?instagram\.com/}i, "").split(%r{[/?#]}).first.to_s
      }.compact_blank
      names = tokens.map { |token| [ token, InstagramGraph::Client.username(token) ] }
      [ names.filter_map(&:last).uniq, names.reject(&:last).map(&:first).uniq ]
    end

    # Os escolhidos viram card em rascunho, já com a fonte (permalink, o @, os
    # termos proibidos — o @ e o nome da conta) e as métricas; as imagens e a
    # legenda vêm na hora da análise (`FetchInstagramReferenceJob`). Post que
    # já virou card não vira outro.
    def analyze!(import, candidate_ids:, curated_by:)
      ids = Array(candidate_ids).first(MAX_SELECTION)
      candidates = import.candidates.where(id: ids, status: "pending").includes(:account).to_a
      raise Invalid, "nothingSelected" if candidates.empty?

      candidates.filter_map { |candidate| card_for(import, candidate, curated_by) }
    end

    # O card novo, ou nil quando o post já tinha card (o candidato passa a
    # apontar para ele).
    def card_for(import, candidate, curated_by)
      existing = ReferenceCard.find_by("source->>'igMediaId' = ?", candidate.ig_media_id)
      if existing
        mark(candidate, existing)
        return nil
      end

      account = candidate.account
      card = ReferenceCard.create!(
        curated_by: curated_by, niche: import.niche, size: import.size,
        format: candidate.reference_format, partial_analysis: candidate.partial,
        source: {
          "url" => candidate.permalink, "channel" => "@#{account.username}",
          "bannedTerms" => [ account.username, account.name ].compact_blank, "igMediaId" => candidate.ig_media_id
        },
        analysis: {
          "metrics" => {
            "likes" => candidate.like_count, "comments" => candidate.comments_count,
            "baselineMedian" => account.baseline_median&.to_f, "collectedAt" => account.fetched_at&.to_date&.iso8601
          }
        }
      )
      mark(candidate, card)
      FetchInstagramReferenceJob.perform_later(card.id)
      card
    rescue ActiveRecord::RecordNotUnique
      mark(candidate, ReferenceCard.find_by("source->>'igMediaId' = ?", candidate.ig_media_id))
      nil
    end

    def mark(candidate, card)
      candidate.update!(status: "carded", reference_card: card)
    end

    # O que passou de 30 dias: o lote, as contas e os candidatos. O card que
    # saiu de um deles fica (ele só guarda o id da mídia).
    def purge!
      ReferenceImport.expired.find_each(&:destroy)
    end
  end
end
