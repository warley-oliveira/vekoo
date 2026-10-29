module References
  # As imagens e a legenda dos cards que vieram do Instagram, buscadas de novo
  # na hora da análise: a URL do Meta expira e a legenda não é guardada.
  #
  # Uma leitura por conta serve a todos os cards dela — a cota do Meta é do app
  # inteiro (~200 chamadas por hora) e cada leitura pode custar várias páginas.
  # Um card que falha não derruba os outros.
  #
  # As imagens viram os originais do card (apagados depois da análise, como em
  # qualquer card); a legenda vai direto para a análise, só na memória — não
  # entra em coluna, log nem argumento de job.
  class FetchInstagramMedia
    # A conta pode ter publicado desde a importação: procura mais fundo.
    SEARCH_LIMIT = 100

    def initialize(cards, client: InstagramGraph::Client.new, fetch: FetchImage.method(:call), analyze: nil)
      @cards = Array(cards)
      @client = client
      @fetch = fetch
      @analyze = analyze || ->(card, caption) { Analyze.new(card, caption: caption).call }
    end

    def call
      @cards.group_by { |card| card.source["channel"].to_s.delete_prefix("@") }.each do |username, cards|
        found = begin
          find_media(username, cards)
        rescue InstagramGraph::Client::Error => e
          cards.each { |card| fail_with(card, e.code) }
          next
        end
        cards.each { |card| process(card, found[card.source["igMediaId"]]) }
      end
      @cards
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

    # Os posts procurados, pelo id. Para de paginar quando acha todos.
    def find_media(username, cards)
      wanted = cards.map { |card| card.source["igMediaId"] }.uniq
      discovery = @client.discover(username, limit: SEARCH_LIMIT) { |media| (wanted - media.map(&:id)).empty? }
      discovery.media.select { |media| wanted.include?(media.id) }.index_by(&:id)
    end

    def process(card, media)
      return fail_with(card, "mediaGone") unless media

      urls = self.class.image_urls(media)
      return fail_with(card, "mediaUnavailable") if urls.empty?

      attach(card, urls)
      @analyze.call(card.reload, media.caption)
    rescue FetchImage::Refused, Images::Invalid
      fail_with(card, "mediaUnavailable")
    rescue StandardError => e
      # Só a classe no log: a mensagem pode carregar a legenda.
      Rails.logger.error("reference #{card.id}: falha inesperada — #{e.class}")
      fail_with(card, "failed")
    end

    def attach(card, urls)
      images = urls.map { |url| @fetch.call(url) }
      images.each { |image| Images.inspect!(image.data) }
      images.each_with_index do |image, index|
        card.originals.attach(io: StringIO.new(image.data), filename: "lamina-#{index + 1}", content_type: image.content_type)
      end
      unless card.thumbnail.attached?
        card.thumbnail.attach(io: StringIO.new(Images.thumbnail(images.first.data)), filename: "miniatura.jpg", content_type: "image/jpeg")
      end
      card.save!
    end

    def fail_with(card, code)
      Rails.logger.warn("reference #{card.id}: mídia do Instagram — #{code}")
      card.update_columns(analysis_status: "failed", analysis_error: { "code" => code }, updated_at: Time.current)
      card
    end
  end
end
