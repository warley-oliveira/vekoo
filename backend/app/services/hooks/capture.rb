module Hooks
  # O que guardamos de uma requisição recebida: é o argumento do job, o que o modo teste mostra e o que vai
  # para o log. Com teto, e sem os cabeçalhos que carregam segredo de quem chamou.
  module Capture
    # Passou disso a entrada responde 413: é o corpo inteiro que viaja no argumento do job, no Redis.
    MAX_BODY_BYTES = 1.megabyte
    # O log guarda até aqui. Acima, o corpo vira um aviso, e as ações ainda recebem o corpo inteiro.
    MAX_LOGGED_BODY_BYTES = 100.kilobytes

    SENSITIVE_HEADERS = /\A(authorization|cookie|proxy-authorization|x-api-key|api-key|x-auth-token|x-vekoo-signature)\z/i
    MAX_HEADERS = 50
    MAX_HEADER_VALUE = 1_000

    module_function

    # @return [Hash] { "method", "headers", "body", "query", "ip", "received_at" }, só com chaves de texto
    def from_request(request)
      {
        "method" => request.request_method,
        "headers" => headers_of(request),
        "body" => clean_hash(request.request_parameters),
        "query" => clean_hash(request.query_parameters),
        "ip" => request.remote_ip,
        "received_at" => Time.current.iso8601
      }
    end

    # O mesmo pedido, com o corpo cortado para caber no log.
    def for_log(capture)
      body = capture["body"]
      return capture if body.to_json.bytesize <= MAX_LOGGED_BODY_BYTES

      capture.merge("body" => { "_truncated" => true, "_message" => I18n.t("automation.hooks.body_too_large") })
    end

    # O mapa que as ações leem: `{{body.x}}`, `{{query.x}}`, `{{headers.X-Foo}}`.
    def payload_of(capture)
      capture.slice("headers", "body", "query")
    end

    def headers_of(request)
      headers = request.headers.to_h.select do |key, _|
        key.to_s.start_with?("HTTP_") || %w[CONTENT_TYPE CONTENT_LENGTH].include?(key.to_s)
      end

      headers.each_with_object({}) do |(key, value), result|
        name = key.to_s.delete_prefix("HTTP_").split("_").map(&:capitalize).join("-")
        next if name.match?(SENSITIVE_HEADERS) || !value.is_a?(String)

        result[name] = value.truncate(MAX_HEADER_VALUE)
        break result if result.size >= MAX_HEADERS
      end
    end
    private_class_method :headers_of

    def clean_hash(params)
      value = params.to_h
      # Só o que JSON representa, porque vira argumento de job.
      JSON.parse(value.to_json)
    rescue StandardError
      {}
    end
    private_class_method :clean_hash
  end
end
