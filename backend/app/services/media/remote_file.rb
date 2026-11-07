# frozen_string_literal: true

module Media
  # Baixa uma mídia cujo endereço veio de fora: o corpo de um webhook de provedor (que qualquer um pode
  # tentar forjar) ou o que a pessoa escreveu num modelo de mensagem. Quem escolhe o endereço não é a gente,
  # então passa pelas travas de `SafeHttp`: nada de rede interna, redirecionamento conferido a cada salto,
  # e o download para no teto em vez de encher a memória.
  #
  # Para quem chama, recusa e falha de rede são a mesma coisa: a mídia não veio.
  module RemoteFile
    # O maior que os provedores aceitam em documento, o mesmo teto dos anexos e do proxy de mídia.
    MAX_BYTES = 100.megabytes
    # Mais folgado que o padrão de `SafeHttp`, porque um vídeo grande leva tempo de verdade.
    READ_TIMEOUT = 30
    TOTAL_TIMEOUT = 120

    module_function

    # @return [SafeHttp::Response]
    # @raise [SafeHttp::Refused] destino recusado, grande demais ou demorado demais
    def get(url, max_bytes: MAX_BYTES)
      SafeHttp.request(url.to_s, max_bytes: max_bytes, read_timeout: READ_TIMEOUT, total_timeout: TOTAL_TIMEOUT)
    end
  end
end
