# Cabeçalho que carrega segredo é só de escrita, como o token de um conector ou o segredo de assinatura. Na
# resposta vai a máscara, e quem a manda de volta não quis mudar: fica o que estava. A tela não precisa saber
# disso, porque salva o que recebeu.
#
# Se o destino mudar, a máscara não vale e o valor guardado não vai junto: senão bastaria trocar a URL para o
# segredo ir parar em outro servidor, e esconder o valor não teria servido para nada. É a mesma regra que
# `SafeHttp` segue ao ser redirecionado para outro host.
#
# Vale para as duas formas guardadas: `[{ "key", "value" }]` (ação de webhook) e `{ nome => valor }` (gatilho).
module SecretHeaders
  # O mesmo critério da tela (`SECRET_HEADER`, em components/webhooks/simple-actions.tsx), mais `cookie`.
  NAME = /authorization|cookie|token|secret|api[-_]?key|password|senha/i
  MASK = "••••••••".freeze

  # Não há valor que possa seguir: a pessoa precisa digitar de novo.
  class NeedsRetyping < StandardError
    attr_reader :header

    def initialize(header)
      @header = header.to_s
      super("cabeçalho #{@header} precisa ser digitado de novo")
    end
  end

  module_function

  # @return o mesmo formato que entrou, com o valor secreto trocado pela máscara
  def mask(headers)
    each_header(headers) { |name, value| secret?(name) && value.present? ? MASK : value }
  end

  # @param incoming o que vai ficar gravado se nada for recusado
  # @param stored o que estava guardado
  # @param same_destination [Boolean] ver `same_destination?`
  # @return `incoming`, com o valor guardado no lugar da máscara
  # @raise [NeedsRetyping]
  def restore(incoming, stored:, same_destination:)
    known = values_of(stored)

    each_header(incoming) do |name, value|
      next value unless secret?(name)

      kept = known[name.to_s.downcase]
      next value if value.blank? || (value != MASK && value != kept) || (value == kept && same_destination)
      # Sobra a máscara, ou o valor antigo seguindo junto quando o pedido troca a URL sem mandar os cabeçalhos.
      raise NeedsRetyping, name if kept.blank? || !same_destination

      kept
    end
  end

  # Esquema, host e porta: mudar só o caminho continua sendo o mesmo servidor. Por texto, e não por `URI`, porque
  # a URL pode ter variável (`{{body.id}}`), que o `URI` recusa.
  def same_destination?(one, other)
    origin = origin_of(one)

    origin.present? && origin == origin_of(other)
  end

  def secret?(name)
    name.to_s.match?(NAME)
  end
  private_class_method :secret?

  def origin_of(url)
    url.to_s.strip[%r{\A[a-z][a-z0-9+.-]*://[^/?#]+}i]&.downcase
  end
  private_class_method :origin_of

  def values_of(headers)
    pairs = []
    each_header(headers) do |name, value|
      pairs << [ name.to_s.downcase, value ]
      value
    end
    pairs.to_h
  end
  private_class_method :values_of

  # Devolve a mesma forma, com o valor que o bloco devolver.
  def each_header(headers)
    case headers
    when Array
      headers.map do |header|
        next header unless header.is_a?(Hash)

        header = header.to_h.stringify_keys
        header.merge("value" => yield(header["key"], header["value"]))
      end
    when Hash then headers.to_h { |name, value| [ name, yield(name, value) ] }
    else headers
    end
  end
  private_class_method :each_header
end
