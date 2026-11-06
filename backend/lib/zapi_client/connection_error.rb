# frozen_string_literal: true

class ZapiClient
  # Não chegou à Z-API: rede, DNS, tempo esgotado. Quem mostra o motivo a uma pessoa precisa saber
  # a diferença de uma recusa da Z-API, que explica o que fazer.
  class ConnectionError < Error; end
end
