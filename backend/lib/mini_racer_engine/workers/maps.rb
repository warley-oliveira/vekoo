module MiniRacerEngine::Workers
  # Expõe `maps.routes(origin, destination, options)` ao JS.
  #
  # Encapsula a Google Routes API v2 (`:computeRoutes`) para que o código do usuário calcule
  # rotas entre dois endereços sem nunca ver a API key, lida no servidor de
  # `GOOGLE_MAPS_API_KEY`. O destino é fixo, então não passa por `SafeHttp`.
  #
  # As rotas alternativas retornam ordenadas da mais curta à mais longa.
  class Maps < MiniRacerEngine::EngineModule
    ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes".freeze
    TIMEOUT = 20
    MAX_ROUTES = 5

    TRAVEL_MODES = %w[DRIVE WALK BICYCLE TWO_WHEELER TRANSIT].freeze
    UNIT_SYSTEMS = %w[METRIC IMPERIAL].freeze
    SORT_KEYS = %w[distance duration].freeze

    DEFAULT_TRAVEL_MODE = "DRIVE".freeze
    DEFAULT_LANGUAGE = "pt-BR".freeze
    DEFAULT_REGION = "br".freeze
    DEFAULT_UNITS = "METRIC".freeze
    DEFAULT_SORT = "distance".freeze

    # A Routes API exige FieldMask explícito — sem ele a resposta vem vazia.
    FIELD_MASK = %w[
      routes.description
      routes.distanceMeters
      routes.duration
      routes.staticDuration
      routes.polyline.encodedPolyline
      routes.warnings
    ].join(",").freeze

    def register(worker, context, event)
      @worker = worker
      context.attach("maps.routes", proc { |*params| attach_method(method(:routes), params, event) })
    end

    private

    # @param params [Array] `[origin, destination, options]` vindos do JS.
    # @return [Hash] `{ ok: true, count:, routes: [...] }` ou `{ ok: false, status:, error: }`.
    def routes(params)
      origin, destination, options = params
      options = normalize_options(options)

      validation_error = validate(origin, destination, options)
      return validation_error if validation_error

      key = api_key
      return error(500, "Google Maps API key not configured") if key.blank?

      # Cada chamada custa dinheiro na conta do servidor: entra na cota de rede.
      budget&.charge_fetch!

      response = post_compute_routes(build_payload(origin, destination, options), key)
      return google_error(response) unless success?(response)

      build_result(origin, destination, options, extract_routes(response))
    rescue MiniRacerEngine::Error
      raise
    rescue StandardError => e
      Rails.logger.error("[MR][maps.routes] #{e.class}: #{e.message}")
      error(500, e.message)
    end

    # ── Requisição ─────────────────────────────────────────────────────

    def post_compute_routes(payload, key)
      HTTParty.post(
        ENDPOINT,
        headers: {
          "Content-Type" => "application/json",
          "X-Goog-Api-Key" => key,
          "X-Goog-FieldMask" => FIELD_MASK
        },
        body: payload.to_json,
        timeout: request_timeout
      )
    end

    # O `timeout` do V8 não interrompe um callback Ruby.
    def request_timeout
      [ TIMEOUT, budget&.remaining_seconds || TIMEOUT, ].min.clamp(0.01, TIMEOUT)
    end

    def build_payload(origin, destination, options)
      {
        origin: { address: origin.to_s.strip },
        destination: { address: destination.to_s.strip },
        travelMode: options[:travel_mode],
        computeAlternativeRoutes: true,
        languageCode: options[:language],
        regionCode: options[:region],
        units: options[:units],
        routeModifiers: route_modifiers(options),
        routingPreference: routing_preference(options),
        departureTime: options[:departure_time]
      }.compact
    end

    def route_modifiers(options)
      modifiers = {
        avoidTolls: options[:avoid_tolls],
        avoidHighways: options[:avoid_highways],
        avoidFerries: options[:avoid_ferries]
      }.compact

      modifiers.presence
    end

    # `routingPreference` só é aceito para DRIVE/TWO_WHEELER. TRAFFIC_AWARE apenas
    # quando o usuário informa `departureTime`, para não encarecer a chamada à toa.
    def routing_preference(options)
      return nil unless %w[DRIVE TWO_WHEELER].include?(options[:travel_mode])

      options[:departure_time].present? ? "TRAFFIC_AWARE" : "TRAFFIC_UNAWARE"
    end

    # ── Opções ─────────────────────────────────────────────────────────

    def normalize_options(options)
      options = {} unless options.is_a?(Hash)

      {
        travel_mode: option(options, "travel_mode", "travelMode").to_s.upcase.presence || DEFAULT_TRAVEL_MODE,
        language: option(options, "language", "languageCode").to_s.presence || DEFAULT_LANGUAGE,
        region: option(options, "region", "regionCode").to_s.presence || DEFAULT_REGION,
        units: option(options, "units").to_s.upcase.presence || DEFAULT_UNITS,
        avoid_tolls: boolean_option(options, "avoid_tolls", "avoidTolls"),
        avoid_highways: boolean_option(options, "avoid_highways", "avoidHighways"),
        avoid_ferries: boolean_option(options, "avoid_ferries", "avoidFerries"),
        departure_time: option(options, "departure_time", "departureTime").to_s.presence,
        sort_by: option(options, "sort_by", "sortBy").to_s.downcase.presence || DEFAULT_SORT,
        max_routes: max_routes(option(options, "max_routes", "maxRoutes"))
      }
    end

    # Lê a opção aceitando snake_case e camelCase, como `Fetch#request` faz com
    # `handle_url` / `handleUrl`.
    def option(options, snake_key, camel_key = nil)
      value = options[snake_key]
      value = options[camel_key] if value.nil? && camel_key
      value
    end

    def boolean_option(options, snake_key, camel_key)
      value = option(options, snake_key, camel_key)
      return nil if value.nil?

      ActiveModel::Type::Boolean.new.cast(value)
    end

    def max_routes(value)
      limit = value.to_i
      return MAX_ROUTES if limit <= 0

      [ limit, MAX_ROUTES ].min
    end

    def validate(origin, destination, options)
      return error(400, "Missing origin") if origin.to_s.strip.blank?
      return error(400, "Missing destination") if destination.to_s.strip.blank?

      unless TRAVEL_MODES.include?(options[:travel_mode])
        return error(400, "Invalid travelMode '#{options[:travel_mode]}'. Allowed: #{TRAVEL_MODES.join(', ')}")
      end

      unless UNIT_SYSTEMS.include?(options[:units])
        return error(400, "Invalid units '#{options[:units]}'. Allowed: #{UNIT_SYSTEMS.join(', ')}")
      end

      unless SORT_KEYS.include?(options[:sort_by])
        return error(400, "Invalid sortBy '#{options[:sort_by]}'. Allowed: #{SORT_KEYS.join(', ')}")
      end

      nil
    end

    # ── Resposta ───────────────────────────────────────────────────────

    def success?(response)
      response.code >= 200 && response.code < 300
    end

    def extract_routes(response)
      body = parsed_body(response)
      return [] unless body.is_a?(Hash)

      Array(body["routes"])
    end

    # HTTParty já devolve Hash quando o content-type é JSON, mas a Routes API
    # pode responder texto puro em alguns erros — aí o parse é feito aqui.
    def parsed_body(response)
      body = response.parsed_response
      return body unless body.is_a?(String)

      JSON.parse(body)
    rescue JSON::ParserError
      nil
    end

    def build_result(origin, destination, options, raw_routes)
      routes = raw_routes.map { |route| map_route(route) }
      routes = sort_routes(routes, options[:sort_by]).first(options[:max_routes])
      routes.each_with_index { |route, index| route[:index] = index }

      {
        ok: true,
        count: routes.size,
        origin: origin.to_s.strip,
        destination: destination.to_s.strip,
        travelMode: options[:travel_mode],
        sortBy: options[:sort_by],
        routes: routes
      }
    end

    def map_route(route)
      distance = route["distanceMeters"].to_i
      duration = parse_duration(route["duration"])

      {
        index: 0,
        summary: route["description"].presence,
        distanceMeters: distance,
        distanceText: format_distance(distance),
        durationSeconds: duration,
        durationText: format_duration(duration),
        staticDurationSeconds: parse_duration(route["staticDuration"]),
        encodedPolyline: route.dig("polyline", "encodedPolyline"),
        warnings: Array(route["warnings"])
      }
    end

    def sort_routes(routes, sort_by)
      key = sort_by == "duration" ? :durationSeconds : :distanceMeters
      routes.sort_by { |route| route[key] || Float::INFINITY }
    end

    # A Routes API devolve durações como string de segundos ("480s").
    def parse_duration(value)
      return nil if value.blank?

      match = value.to_s.match(/\A(\d+(?:\.\d+)?)s?\z/)
      return nil unless match

      match[1].to_f.round
    end

    def format_distance(meters)
      return nil if meters.nil?
      return "#{meters} m" if meters < 1000

      format("%.1f km", meters / 1000.0).tr(".", ",")
    end

    def format_duration(seconds)
      return nil if seconds.nil?
      return "#{seconds} s" if seconds < 60

      minutes = (seconds / 60.0).round
      return "#{minutes} min" if minutes < 60

      hours = minutes / 60
      rest = minutes % 60
      rest.zero? ? "#{hours} h" : "#{hours} h #{rest} min"
    end

    # ── Erros ──────────────────────────────────────────────────────────

    def google_error(response)
      body = parsed_body(response)
      message = body.is_a?(Hash) ? body.dig("error", "message") : nil

      error(response.code, message.presence || "Google Maps request failed: HTTP #{response.code}", body)
    end

    def error(status, message, details = nil)
      result = { ok: false, status: status, error: message }
      result[:details] = details if details.present?
      result
    end

    def api_key
      ENV["GOOGLE_MAPS_API_KEY"]
    end
  end
end
