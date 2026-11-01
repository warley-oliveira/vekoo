module References
  # Uma conta de um lote: uma chamada à Business Discovery, a mediana, os
  # candidatos. A legenda chega junto com os posts e fica só na memória — o
  # candidato não tem onde guardá-la.
  class ImportAccount
    def initialize(account, client: InstagramGraph::Client.new, now: Time.current)
      @account = account
      @client = client
      @now = now
    end

    def call
      @account.update!(status: "running", error_code: nil, retry_at: nil)
      InstagramGraph::Throttle.check!
      discovery = @client.discover(@account.username)
      ranking = InstagramRanking.call(discovery.media, now: @now)
      store(discovery, ranking)
      @account
    rescue InstagramGraph::Client::Error => e
      fail_with(e)
    end

    private

    def store(discovery, ranking)
      ids = ranking.candidates.map { |candidate| candidate.media.id }
      carded = ReferenceCard.where("source->>'igMediaId' IN (?)", ids.presence || [ "" ])
        .pluck(Arel.sql("source->>'igMediaId'"), :id).to_h

      ReferenceImportAccount.transaction do
        @account.candidates.delete_all
        ranking.candidates.each do |candidate|
          media = candidate.media
          @account.candidates.create!(
            ig_media_id: media.id, media_type: media.media_type, product_type: media.product_type,
            permalink: media.permalink, preview_url: preview(media), like_count: media.like_count,
            comments_count: media.comments_count, relative_engagement: candidate.relative, posted_at: media.posted_at,
            children_count: media.children.length, partial: candidate.partial,
            status: carded[media.id] ? "carded" : "pending", reference_card_id: carded[media.id]
          )
        end
        @account.update!(
          status: "done", name: discovery.account&.name, followers_count: discovery.account&.followers_count,
          fetched_count: discovery.media.length, eligible_count: ranking.eligible, baseline_median: ranking.median,
          fetched_at: @now
        )
      end
    end

    # A imagem que a curadoria vê na lista: a foto, a primeira lâmina ou a
    # capa do vídeo. É a URL do Meta, que expira — serve para escolher, não
    # para guardar.
    def preview(media)
      return media.thumbnail_url if media.video?

      first = media.children.first
      return first.video? ? first.thumbnail_url : first.media_url if first

      media.media_url
    end

    def fail_with(error)
      retry_at = InstagramGraph::Throttle.until!(error.retry_after) if error.code == "rateLimited"
      Rails.logger.warn("[instagram] @#{@account.username}: #{error.code}")
      @account.update!(status: "error", error_code: error.code, retry_at: retry_at)
      @account
    end
  end
end
