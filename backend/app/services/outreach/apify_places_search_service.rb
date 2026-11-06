module Outreach
  # Busca estabelecimentos no Google Maps pelo ator do Apify e devolve só os que têm telefone. Origem:
  # Campaigns::ApifyPlacesSearchService.
  #
  # Chamada síncrona: a resposta só vem com a busca pronta. Quem pode esperar é o job
  # (`PlaceExtractionJob`); na requisição o tempo é menor, para não prender uma thread do Puma.
  class ApifyPlacesSearchService
    MAX_PLACES = 200
    DEFAULT_MAX_PLACES = 100
    ACTOR_ID = "compass~crawler-google-places".freeze
    DEFAULT_API_BASE = "https://api.apify.com/v2".freeze
    JOB_TIMEOUT = 300
    REQUEST_TIMEOUT = 120

    # `code` é o contrato de máquina; `message`, o que o Apify disse, quando disse algo útil.
    class ApifyError < StandardError
      attr_reader :code

      def initialize(code, message = nil)
        @code = code
        super(message || code)
      end
    end

    class ApifyAuthError < ApifyError; end
    class ApifyQuotaError < ApifyError; end

    # @param filters [Hash] :reviews_sort, :min_score, :category_filter, :skip_closed_places
    def initialize(search_query:, location: nil, max_places: DEFAULT_MAX_PLACES, language: "pt-BR", filters: {}, timeout: JOB_TIMEOUT)
      @search_query = search_query.to_s.strip
      @location = location.to_s.strip.presence
      @max_places = max_places.to_i.clamp(1, MAX_PLACES)
      @language = language
      @filters = (filters || {}).to_h.symbolize_keys
      @timeout = timeout
    end

    # @return [Array<Hash>] chaves em snake_case: é assim que ficam guardadas na extração
    def call
      validate!
      normalize_results(run_actor)
    end

    private

    def validate!
      raise ArgumentError, "search_query é obrigatório" if @search_query.blank?
      raise ApifyAuthError, "apifyNotConfigured" unless Capabilities.apify?
    end

    # O token no cabeçalho, e não na URL como na origem: URL acaba em log.
    def run_actor
      response = HTTParty.post(
        "#{ENV.fetch('APIFY_API_BASE', DEFAULT_API_BASE)}/acts/#{ACTOR_ID}/run-sync-get-dataset-items",
        headers: {
          "Content-Type" => "application/json",
          "Accept" => "application/json",
          "Authorization" => "Bearer #{Capabilities.apify_token}"
        },
        body: build_request_body.to_json,
        timeout: @timeout
      )

      handle_response_errors!(response)

      items = response.parsed_response
      items.is_a?(Array) ? items : []
    rescue SocketError, SystemCallError, OpenSSL::SSL::SSLError, HTTParty::Error => e
      Rails.logger.warn("[Outreach::ApifyPlacesSearchService] #{e.class}: #{e.message}")
      raise ApifyError, "apifyFailed"
    end

    def build_request_body
      body = {
        searchStringsArray: [ @search_query ],
        maxCrawledPlacesPerSearch: @max_places,
        deeperCityScrape: false,
        onePerQuery: false
      }

      body[:locationQuery] = @location if @location.present?
      body[:reviewsSort] = @filters[:reviews_sort] if @filters[:reviews_sort].present?
      body[:minScore] = @filters[:min_score].to_f if @filters[:min_score].present?
      body[:categoryFilterWords] = @filters[:category_filter].to_s if @filters[:category_filter].present?

      unless @filters[:skip_closed_places].nil?
        body[:skipClosedPlaces] = ActiveModel::Type::Boolean.new.cast(@filters[:skip_closed_places])
      end

      body
    end

    def handle_response_errors!(response)
      case response.code
      when 200..299 then nil
      when 401 then raise ApifyAuthError, "apifyInvalidToken"
      when 402 then raise ApifyQuotaError, "apifyQuotaExceeded"
      when 408, 504 then raise ApifyError, "apifyTimeout"
      else
        message = response.parsed_response.try(:[], "error").try(:[], "message")
        raise ApifyError.new("apifyFailed", message)
      end
    end

    def normalize_results(raw_items)
      raw_items.filter_map do |item|
        phone = item["phoneUnformatted"].presence || item["phone"].presence
        next if phone.blank?

        {
          title: item["title"].to_s,
          phone: item["phone"].to_s,
          phone_unformatted: phone.to_s.gsub(/\D/, ""),
          address: item["address"].to_s,
          street: item["street"].to_s,
          city: item["city"].to_s,
          state: item["state"].to_s,
          postal_code: item["postalCode"].to_s,
          country_code: item["countryCode"].to_s,
          neighborhood: item["neighborhood"].to_s,
          website: item["website"].to_s,
          category_name: item["categoryName"].to_s,
          categories: Array(item["categories"]),
          total_score: item["totalScore"].to_f,
          reviews_count: item["reviewsCount"].to_i,
          image_url: item["imageUrl"].to_s,
          url: item["url"].to_s,
          place_id: item["placeId"].to_s,
          latitude: item.dig("location", "lat").to_f,
          longitude: item.dig("location", "lng").to_f,
          instagram: Array(item["instagrams"]).first.to_s,
          facebook: Array(item["facebooks"]).first.to_s,
          opening_hours: Array(item["openingHours"]).map { |hours| { day: hours["day"], hours: hours["hours"] } }
        }
      end
    end
  end
end
