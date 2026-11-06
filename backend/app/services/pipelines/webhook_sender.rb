module Pipelines
  # A ação "webhook" dos gatilhos. Toda chamada passa por `SafeHttp`: a URL é escrita por quem usa a
  # plataforma. A origem tinha uma lista própria de faixas privadas, resolvia o DNS uma vez para
  # conferir e outra para conectar (DNS rebinding), e não olhava para onde o redirecionamento ia.
  class WebhookSender
    OPEN_TIMEOUT = 5
    READ_TIMEOUT = 10
    TOTAL_TIMEOUT = 15
    MAX_RESPONSE_BYTES = 1.megabyte
    PORTS = MiniRacerEngine::Limits::FETCH_PORTS
    METHODS = { "POST" => :post, "PUT" => :put }.freeze
    USER_AGENT = "VekooPipelines/1.0".freeze

    Result = Struct.new(:success, :status_code, :body, :error, keyword_init: true)

    def self.call(...)
      new(...).send_webhook
    end

    def initialize(url:, method: "POST", headers: {}, body: {}, context: {})
      @url = url
      @method = METHODS.fetch(method.to_s.upcase, :post)
      @headers = (headers || {}).to_h.merge("Content-Type" => "application/json", "User-Agent" => USER_AGENT)
      @body = body
      @context = context
    end

    def send_webhook
      response = SafeHttp.request(
        @url,
        method: @method,
        headers: @headers,
        body: rendered_body,
        max_bytes: MAX_RESPONSE_BYTES,
        ports: PORTS,
        open_timeout: OPEN_TIMEOUT,
        read_timeout: READ_TIMEOUT,
        total_timeout: TOTAL_TIMEOUT
      )

      Result.new(success: response.status < 400, status_code: response.status, body: response.body.to_s.truncate(2000))
    rescue SafeHttp::DestinationRefused => e
      # O motivo fica no log: dizer "resolve para interno" seria um mapa da rede.
      Rails.logger.warn("[Pipelines::WebhookSender] destino recusado: #{e.message}")
      Result.new(success: false, error: I18n.t("pipelines.webhook.destination_refused"))
    rescue SafeHttp::Refused, SocketError, SystemCallError, IOError, OpenSSL::SSL::SSLError, Net::ProtocolError, Timeout::Error => e
      Rails.logger.warn("[Pipelines::WebhookSender] #{e.class}: #{e.message}")
      Result.new(success: false, error: e.message)
    end

    private

    # Texto que é JSON tem as variáveis trocadas valor a valor: assim uma aspa no título do card vira
    # `\"`, e não um corpo quebrado, que é o que a substituição direta da origem gerava.
    def rendered_body
      template = parse_template(@body)
      rendered = render_template_variables(template)
      rendered.is_a?(String) ? rendered : rendered.to_json
    end

    def parse_template(body)
      return body unless body.is_a?(String)

      parsed = JSON.parse(body)
      parsed.is_a?(Hash) || parsed.is_a?(Array) ? parsed : body
    rescue JSON::ParserError
      body
    end

    def render_template_variables(value)
      case value
      when String
        value.gsub(/\{\{(\w+(?:\.\w+)*)\}\}/) { resolve_variable(Regexp.last_match(1)) }
      when Hash
        value.transform_values { |inner| render_template_variables(inner) }
      when Array
        value.map { |inner| render_template_variables(inner) }
      else
        value
      end
    end

    def resolve_variable(path)
      parts = path.split(".")
      root = parts.shift

      value = case root
      when "card" then dig_hash(@context[:card], parts)
      when "board" then dig_hash(@context[:board], parts)
      when "stage" then dig_hash(@context[:stage], parts)
      when "event" then @context[:event_type]
      end

      value.to_s
    end

    def dig_hash(hash, keys)
      return nil if hash.blank?

      keys.reduce(hash) do |current, key|
        break nil unless current.is_a?(Hash)

        current[key.to_s] || current[key.to_sym]
      end
    end
  end
end
