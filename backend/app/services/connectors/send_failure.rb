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

    # @return [String]
    def reason(error)
      return I18n.t("connectors.messages.channel_unreachable") if NETWORK_ERRORS.any? { |kind| error.is_a?(kind) }

      error.message
    end
  end
end
