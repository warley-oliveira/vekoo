module FlowRuntime
  module Nodes
    # Chama um serviço de fora. A URL vem de quem desenhou o fluxo, com variáveis que podem vir do contato, então só sai
    # por `SafeHttp`: daqui não se alcança a rede interna.
    #
    # Saídas `success` (2xx e 3xx) e `error`. Na origem, um 500 seguia por `success`.
    class HttpRequest < Base
      DEFAULT_TIMEOUT = 10
      MAX_TIMEOUT = 30
      MAX_RESPONSE_BYTES = 1.megabyte
      PORTS = [ 80, 443, 8080, 8443 ].freeze
      METHODS = %w[GET POST PUT PATCH DELETE].freeze
      FILTERED_HEADERS = /\A(authorization|cookie|proxy-authorization|x-api-key|api-key|x-auth-token)\z/i
      SENT_BODY = %w[POST PUT PATCH].freeze

      def call
        url = interpolate(data["url"].to_s)
        method = (data["method"] || "GET").to_s.upcase
        return leave_by_error("invalid_url", url, method) if url.blank?
        return leave_by_error("invalid_method", url, method) unless METHODS.include?(method)

        body, status, error = perform_request(url, method)
        saved = data["save_response_to"].present? ? { data["save_response_to"].to_s => body } : {}

        continue(next_node_id(handle: error ? "error" : "success") || default_next_node_id,
                 variables: saved.merge("last_http_status" => status),
                 log: { input: log_input(url, method), output: { status: status, body: body, error: error }.compact })
      end

      private

      def leave_by_error(error, url, method)
        continue(next_node_id(handle: "error") || default_next_node_id, log: { input: log_input(url, method), output: { error: error } })
      end

      def perform_request(url, method)
        response = SafeHttp.request(
          url,
          method: method,
          headers: rendered_headers,
          body: (rendered_body if SENT_BODY.include?(method)),
          max_bytes: MAX_RESPONSE_BYTES,
          ports: PORTS,
          read_timeout: timeout,
          total_timeout: timeout + SafeHttp::OPEN_TIMEOUT
        )
        body = parse_body(response)
        [ body, response.status, response.status >= 400 ? "http_#{response.status}" : nil ]
      rescue SafeHttp::DestinationRefused
        # O motivo não aparece: dizer "resolve para interno" já seria um mapa da rede.
        [ nil, nil, "destination_not_allowed" ]
      rescue SafeHttp::Refused, Timeout::Error, SocketError, SystemCallError, OpenSSL::SSL::SSLError, EOFError, IOError => e
        [ nil, nil, e.message.truncate(300) ]
      end

      def timeout
        seconds = data["timeout"].to_i
        seconds.positive? ? [ seconds, MAX_TIMEOUT ].min : DEFAULT_TIMEOUT
      end

      def rendered_headers
        headers = header_list.each_with_object({}) do |header, result|
          result[header["key"].to_s] = interpolate(header["value"].to_s) if header["key"].present?
        end
        return headers if headers.keys.any? { |name| name.casecmp?("content-type") } || data["body"].blank?

        headers.merge("Content-Type" => "application/json")
      end

      def header_list
        Array(data["headers"]).select { |header| header.is_a?(Hash) }
      end

      def rendered_body
        return nil if data["body"].blank?

        data["body"].is_a?(String) ? interpolate(data["body"]) : deep_interpolate(data["body"]).to_json
      end

      def parse_body(response)
        text = response.body.to_s.dup.force_encoding(Encoding::UTF_8).scrub
        return nil if text.blank?
        return text unless response.content_type.to_s.include?("json")

        JSON.parse(text)
      rescue JSON::ParserError
        text
      end

      # O histórico é aberto a quem vê fluxos: chave de API não fica nele.
      def log_input(url, method)
        headers = header_list.to_h do |header|
          [ header["key"].to_s, header["key"].to_s.match?(FILTERED_HEADERS) ? "[FILTERED]" : header["value"] ]
        end
        { url: url, method: method, headers: headers }
      end
    end
  end
end
