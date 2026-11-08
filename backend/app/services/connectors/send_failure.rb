module Connectors
  # O motivo de uma falha de envio aparece na conversa, para quem está atendendo. Erro de rede vem
  # cru, em inglês e com o endereço do provedor, então vira uma frase; quem chama já registra o
  # detalhe no log. Recusa do provedor continua como veio: é ela que explica o que fazer.
  module SendFailure
    NETWORK_ERRORS = [
      SocketError, SystemCallError, IOError, Timeout::Error, OpenSSL::SSL::SSLError,
      Faraday::ConnectionFailed, Faraday::TimeoutError, Faraday::SSLError
    ].freeze

    module_function

    # O provedor caiu por dentro (5xx com JSON cru): `Failed to send message: {"status":500,...}` não diz nada a quem lê.
    PROVIDER_CRASH = /\AFailed to send (?:message|media)[^:]*: (\{.*\})\z/m

    # @return [String]
    def reason(error)
      return I18n.t("connectors.messages.channel_unreachable") if NETWORK_ERRORS.any? { |kind| error.is_a?(kind) }
      return I18n.t("connectors.messages.provider_failed") if provider_crash?(error.message)

      error.message
    end

    def provider_crash?(message)
      json = message.to_s.match(PROVIDER_CRASH)&.captures&.first
      return false unless json

      JSON.parse(json)["status"].to_i >= 500
    rescue JSON::ParserError
      false
    end
  end
end
