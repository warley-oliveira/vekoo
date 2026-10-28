module References
  # As imagens e a legenda de um card que veio do Instagram, buscadas de novo
  # na hora da análise: a URL do Meta expira e a legenda não é guardada.
  #
  # As imagens viram os originais do card (apagados depois da análise, como em
  # qualquer card); a legenda vai direto para a análise, só na memória — não
  # entra em coluna, log nem argumento de job.
  class FetchInstagramMedia
    # A conta pode ter publicado desde a importação: procura mais fundo.
    SEARCH_LIMIT = 100

    def initialize(card, client: InstagramGraph::Client.new, fetch: FetchImage.method(:call), analyze: nil)
      @card = card
      @client = client
      @fetch = fetch
      @analyze = analyze || ->(card, caption) { Analyze.new(card, caption: caption).call }
    end

    def call
      media = find_media or return fail_with("mediaGone")
      urls = self.class.image_urls(media)
      return fail_with("mediaUnavailable") if urls.empty?

      attach(urls)
      @analyze.call(@card.reload, media.caption)
    rescue InstagramGraph::Client::Error => e
      fail_with(e.code)
    rescue FetchImage::Refused, Images::Invalid
      fail_with("mediaUnavailable")
    end

    # As imagens que vão ao modelo, na ordem do post. Carrossel com mais de 10
    # lâminas: as 9 primeiras e a última (o convite costuma estar no fim).
    # Vídeo — o post ou uma lâmina — entra pela capa.
    def self.image_urls(media)
      if media.carousel?
        children = media.children
        children = children.first(Images::MAX_FILES - 1) + [ children.last ] if children.length > Images::MAX_FILES
        children.filter_map { |child| child.video? ? child.thumbnail_url : child.media_url }
      elsif media.video?
        [ media.thumbnail_url ].compact
      else
        [ media.media_url ].compact
      end
    end

    private

    def find_media
      username = @card.source["channel"].to_s.delete_prefix("@")
      @client.discover(username, limit: SEARCH_LIMIT).media.find { |media| media.id == @card.source["igMediaId"] }
    end

    def attach(urls)
      images = urls.map { |url| @fetch.call(url) }
      images.each { |image| Images.inspect!(image.data) }
      images.each_with_index do |image, index|
        @card.originals.attach(io: StringIO.new(image.data), filename: "lamina-#{index + 1}", content_type: image.content_type)
      end
      unless @card.thumbnail.attached?
        @card.thumbnail.attach(io: StringIO.new(Images.thumbnail(images.first.data)), filename: "miniatura.jpg", content_type: "image/jpeg")
      end
      @card.save!
    end

    def fail_with(code)
      Rails.logger.warn("reference #{@card.id}: mídia do Instagram — #{code}")
      @card.update_columns(analysis_status: "failed", analysis_error: { "code" => code }, updated_at: Time.current)
      @card
    end
  end
end
