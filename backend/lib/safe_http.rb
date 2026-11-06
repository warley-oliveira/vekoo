require "ipaddr"
require "net/http"

# HTTP para URL que veio de fora: planilha do catálogo, script escrito por quem usa a
# plataforma. Quem escolhe o endereço não é a gente, então este é o lugar onde o servidor
# pode virar proxy para dentro da rede (SSRF): metadados da nuvem, Postgres, Redis. As
# travas:
#
#  - só http(s), nas portas permitidas, sem usuário e senha na URL;
#  - todo endereço que o host resolve precisa ser público;
#  - a conexão vai para o IP que foi validado (`ipaddr=`), e não para uma nova resolução,
#    que um DNS malicioso responderia diferente (DNS rebinding);
#  - o proxy de ambiente é desligado, porque conectaria por conta própria;
#  - redirecionamento é seguido à mão, passando por tudo de novo a cada salto, e não leva
#    credencial para outro host;
#  - o download para no teto de bytes, sem ler o resto para a memória;
#  - o tempo tem teto total, além do por pacote: um servidor lento de propósito pingaria
#    um byte por vez para sempre.
class SafeHttp
  # Pedido recusado por nós, ou que estourou um limite.
  class Refused < StandardError; end
  # Recusado por causa do destino. Separado porque o motivo não deve chegar a quem pediu:
  # dizer "resolve para interno" ou "não resolve" já é um mapa da rede.
  class DestinationRefused < Refused; end

  Response = Struct.new(:status, :headers, :body, :content_type, :url, keyword_init: true) do
    def success? = status.between?(200, 299)

    # O `charset` do Content-Type, quando houver.
    def charset
      headers.fetch("content-type", []).first.to_s[/charset="?([^\s;"]+)/i, 1]
    end
  end

  OPEN_TIMEOUT = 5
  READ_TIMEOUT = 15
  TOTAL_TIMEOUT = 30
  MAX_REDIRECTS = 3
  DEFAULT_PORTS = [ 80, 443 ].freeze

  METHODS = {
    get: Net::HTTP::Get, post: Net::HTTP::Post, put: Net::HTTP::Put, patch: Net::HTTP::Patch,
    delete: Net::HTTP::Delete, head: Net::HTTP::Head, options: Net::HTTP::Options
  }.freeze

  # O que IPAddr#private? / #loopback? / #link_local? não cobrem.
  BLOCKED_RANGES = %w[
    0.0.0.0/8 100.64.0.0/10 192.0.0.0/24 192.0.2.0/24 198.18.0.0/15 198.51.100.0/24
    203.0.113.0/24 224.0.0.0/4 240.0.0.0/4 ::/96 64:ff9b::/96 100::/64 2001::/23 2001:db8::/32
    2002::/16 fec0::/10 ff00::/8
  ].map { |range| IPAddr.new(range) }.freeze

  # Nome de cabeçalho (RFC 9110, token). O Net::HTTP só confere o valor: sem isto, um nome
  # com quebra de linha injetaria cabeçalhos e até outra requisição na mesma conexão.
  HEADER_NAME = /\A[!#$%&'*+\-.^_`|~0-9A-Za-z]+\z/

  # Não passam adiante: a conexão vai para o IP validado, e escolher o `Host` à mão
  # alcançaria um site interno atrás de um proxy público.
  DROPPED_HEADERS = %w[host].freeze
  # Ficam para trás quando o redirecionamento muda de host.
  CREDENTIAL_HEADERS = %w[authorization cookie proxy-authorization].freeze

  # Escreve os cabeçalhos com a caixa que o pedido trouxe. O Net::HTTP capitaliza tudo na
  # hora de enviar, e há servidores fora da RFC que exigem uma caixa específica.
  module ExactHeaderCase
    attr_writer :exact_header_names

    def each_capitalized
      return enum_for(__method__) { @header.size } unless block_given?

      @header.each { |key, values| yield(@exact_header_names.fetch(key) { capitalize(key) }, values.join(", ")) }
    end
  end

  # Separado para as specs não dependerem de DNS de verdade.
  def self.resolve(host)
    Addrinfo.getaddrinfo(host, nil, nil, :STREAM).map(&:ip_address).uniq
  rescue SocketError => e
    raise DestinationRefused, "host não resolve: #{e.message}"
  end

  def self.request(url, **options)
    new(url, **options).request
  end

  def self.internal_address?(address)
    ip = IPAddr.new(address.split("%").first)
    ip = ip.native if ip.ipv4_mapped?

    ip.private? || ip.loopback? || ip.link_local? || BLOCKED_RANGES.any? { |range| range.include?(ip) }
  rescue IPAddr::InvalidAddressError
    true
  end

  # @param max_bytes teto do corpo da resposta, já descomprimido
  # @param ports portas aceitas
  # @param resolver quem resolve o host; `SafeHttp.resolve` se não vier
  # @param exact_header_case envia os nomes de cabeçalho exatamente como vieram
  def initialize(url, max_bytes:, method: :get, headers: {}, body: nil, ports: DEFAULT_PORTS,
    max_redirects: MAX_REDIRECTS, open_timeout: OPEN_TIMEOUT, read_timeout: READ_TIMEOUT,
    total_timeout: TOTAL_TIMEOUT, resolver: nil, exact_header_case: false)
    @url = url
    @max_bytes = max_bytes
    @method = method.to_s.downcase.to_sym
    @headers = clean_headers(headers)
    @body = body
    @ports = ports
    @max_redirects = max_redirects
    @open_timeout = open_timeout
    @read_timeout = read_timeout
    @total_timeout = total_timeout
    @resolver = resolver || self.class.method(:resolve)
    @exact_header_case = exact_header_case
  end

  def request
    raise Refused, "método não permitido: #{@method}" unless METHODS.key?(@method)

    Timeout.timeout(@total_timeout) do
      current = @url
      (@max_redirects + 1).times do
        outcome = follow(current)
        return outcome if outcome.is_a?(Response)

        current = outcome
      end
      raise Refused, "redirecionamentos demais"
    end
  rescue Timeout::Error
    raise Refused, "tempo esgotado"
  end

  private

  def follow(url)
    uri = parse(url)
    address = public_address_of(uri.hostname)

    # O `nil` desliga o proxy de ambiente (`http_proxy`), que conectaria por conta própria
    # e tornaria inútil fixar o IP.
    http = Net::HTTP.new(uri.hostname, uri.port, nil)
    http.use_ssl = uri.scheme == "https"
    http.ipaddr = address
    http.open_timeout = @open_timeout
    http.read_timeout = @read_timeout

    http.start do
      http.request(build_request(uri)) { |response| return interpret(response, uri) }
    end
  end

  def build_request(uri)
    request = METHODS.fetch(@method).new(uri, @headers.transform_keys(&:to_s))
    request.body = @body if @body && request.request_body_permitted?

    if @exact_header_case
      request.extend(ExactHeaderCase)
      request.exact_header_names = @headers.keys.index_by { |name| name.to_s.downcase }
    end
    request
  rescue ArgumentError => e
    # Quebra de linha no valor de cabeçalho, que o próprio Net::HTTP recusa.
    raise Refused, "cabeçalho inválido: #{e.message}"
  end

  # Devolve a resposta (Response) ou a próxima URL (String).
  def interpret(response, uri)
    location = response["location"]
    return redirect_to(location, response, uri) if redirect?(response) && location.present?

    Response.new(
      status: response.code.to_i,
      headers: response.to_hash,
      body: read_capped(response),
      content_type: response["content-type"].to_s.split(";").first.to_s.strip,
      url: uri.to_s
    )
  end

  # 304 é "redirecionamento" para o Net::HTTP, mas não tem para onde ir.
  def redirect?(response)
    response.is_a?(Net::HTTPRedirection) && !response.is_a?(Net::HTTPNotModified)
  end

  def redirect_to(location, response, uri)
    target = URI.join(uri.to_s, percent_encode(location))
    leave_credentials_behind if target.hostname != uri.hostname
    change_method_for(response)
    target.to_s
  rescue URI::Error => e
    raise Refused, "redirecionamento inválido: #{e.message}"
  end

  def leave_credentials_behind
    @headers = @headers.reject { |name, _| CREDENTIAL_HEADERS.include?(name.to_s.downcase) }
  end

  # Só 307 e 308 mantêm o método e o corpo, como os navegadores e como o HTTParty fazia.
  def change_method_for(response)
    return if %w[307 308].include?(response.code) || @method == :head

    @method = :get
    @body = nil
    @headers = @headers.reject { |name, _| %w[content-type content-length].include?(name.to_s.downcase) }
  end

  def read_capped(response)
    raise Refused, "acima do limite" if response["content-length"].to_i > @max_bytes

    body = +"".b
    response.read_body do |chunk|
      body << chunk
      raise Refused, "acima do limite" if body.bytesize > @max_bytes
    end
    body
  end

  def clean_headers(headers)
    (headers || {}).each_with_object({}) do |(name, value), clean|
      next if value.nil? || DROPPED_HEADERS.include?(name.to_s.downcase)
      raise Refused, "cabeçalho inválido: #{name}" unless name.to_s.match?(HEADER_NAME)

      clean[name] = value.to_s
    end
  end

  def parse(url)
    uri = URI.parse(percent_encode(url.to_s.strip))
    raise DestinationRefused, "esquema não permitido" unless uri.is_a?(URI::HTTP) && uri.hostname.present?
    raise DestinationRefused, "porta não permitida" unless @ports.include?(uri.port)
    raise DestinationRefused, "credencial na URL" if uri.userinfo.present?

    uri
  rescue URI::InvalidURIError => e
    raise DestinationRefused, "URL inválida: #{e.message}"
  end

  # Nome de arquivo com acento ou espaço é comum em URL de loja, e o `URI` não aceita cru.
  # Só o que está fora do ASCII visível: um `%20` que já veio codificado fica como está, em
  # vez de virar `%2520`.
  def percent_encode(text)
    text.gsub(/[^\x21-\x7E]/) { |char| char.bytes.map { |byte| format("%%%02X", byte) }.join }
  end

  # Um único endereço interno recusa o host inteiro: é assim que o DNS de quem ataca
  # misturaria um IP público com um interno.
  def public_address_of(host)
    addresses = @resolver.call(host)
    raise DestinationRefused, "host não resolve" if addresses.empty?

    internal = addresses.find { |address| self.class.internal_address?(address) }
    raise DestinationRefused, "endereço interno: #{internal}" if internal

    addresses.first
  end
end
