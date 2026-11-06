module HookAction
  # Repassa para outra URL o que chegou. A URL e os cabeçalhos são escritos pela pessoa e podem trazer variáveis
  # do que chegou de fora, por isso só saem por `SafeHttp`: daqui não se alcança a rede interna.
  #
  # Falha vira alerta na organização (`webhook_delivery_failed`), que a próxima entrega resolve.
  class HttpRequest < Base
    METHODS = %w[GET POST PUT PATCH DELETE].freeze
    MAX_RESPONSE_BYTES = 1.megabyte
    TOTAL_TIMEOUT = 20

    store_accessor :config, :url, :http_method, :headers, :body

    validates :url, presence: true
    validates :http_method, inclusion: { in: METHODS }, allow_blank: true

    def perform(payload, chat = nil)
      @current_chat = chat
      response = SafeHttp.request(
        replace_template_variables(url, payload),
        method: (http_method.presence || "POST").downcase,
        headers: rendered_headers(payload),
        body: rendered_body(payload),
        max_bytes: MAX_RESPONSE_BYTES,
        total_timeout: TOTAL_TIMEOUT
      )

      return hook.resolve_failure_alert! if response.success?

      raise Hooks::ActionFailed, I18n.t("automation.hooks.errors.http_status", status: response.status)
    rescue SafeHttp::DestinationRefused
      # O motivo não vai para fora: "resolve para interno" já é um mapa da rede.
      fail_delivery(I18n.t("automation.hooks.errors.http_destination"))
    rescue SafeHttp::Refused, Timeout::Error, SocketError, SystemCallError, OpenSSL::SSL::SSLError, EOFError, IOError => e
      fail_delivery(I18n.t("automation.hooks.errors.http_failed", reason: e.message.truncate(200)))
    rescue Hooks::ActionFailed => e
      fail_delivery(e.message)
    end

    private

    # A entrega falhou, e as ações seguintes continuam: quem manda o pedido não tem nada a ver com isto.
    def fail_delivery(message)
      hook.alert_failure!(message)
      @current_chat
    end

    def rendered_headers(payload)
      list = headers.is_a?(Array) ? headers : []
      list.each_with_object({}) do |header, result|
        header = header.to_h.with_indifferent_access
        result[header[:key].to_s] = replace_template_variables(header[:value], payload) if header[:key].present?
      end.reverse_merge("Content-Type" => "application/json")
    end

    def rendered_body(payload)
      body.is_a?(Hash) ? body.to_json : replace_template_variables(body, payload).presence
    end
  end
end
