require "ipaddr"
require "net/http"

module Products
  # Baixa uma imagem cuja URL veio do cliente, a partir dos nossos servidores.
  #
  # Quem manda a planilha escolhe o endereço, então este é o lugar onde o catálogo pode
  # virar proxy para dentro da rede (SSRF): metadados da nuvem, Postgres, Redis. As travas:
  #
  #  - só http(s) nas portas padrão, sem usuário e senha na URL;
  #  - todo endereço que o host resolve precisa ser público;
  #  - a conexão vai para o IP que foi validado (`ipaddr=`), e não para uma nova resolução,
  #    que um DNS malicioso responderia diferente (DNS rebinding);
  #  - redirecionamento é seguido à mão, passando por tudo de novo a cada salto;
  #  - o download para no teto de bytes, sem ler o resto para a memória.
  class RemoteImage
    class Refused < StandardError; end

    Result = Struct.new(:body, :content_type, keyword_init: true)

    OPEN_TIMEOUT = 5
    READ_TIMEOUT = 15
    # Teto do download inteiro: `READ_TIMEOUT` é por pacote, e um servidor lento de
    # propósito pingaria um byte por vez para sempre.
    TOTAL_TIMEOUT = 30
    MAX_REDIRECTS = 3
    ALLOWED_PORTS = [ 80, 443 ].freeze

    # O que IPAddr#private? / #loopback? / #link_local? não cobrem.
    BLOCKED_RANGES = %w[
      0.0.0.0/8 100.64.0.0/10 192.0.0.0/24 192.0.2.0/24 198.18.0.0/15 198.51.100.0/24
      203.0.113.0/24 224.0.0.0/4 240.0.0.0/4 ::/128 64:ff9b::/96 100::/64 2001:db8::/32 ff00::/8
    ].map { |range| IPAddr.new(range) }.freeze

    def self.fetch(url, max_bytes:)
      new(url, max_bytes: max_bytes).fetch
    end

    # Separado para as specs não dependerem de DNS de verdade.
    def self.resolve(host)
      Addrinfo.getaddrinfo(host, nil, nil, :STREAM).map(&:ip_address).uniq
    rescue SocketError => e
      raise Refused, "host não resolve: #{e.message}"
    end

    def initialize(url, max_bytes:)
      @url = url
      @max_bytes = max_bytes
    end

    def fetch
      Timeout.timeout(TOTAL_TIMEOUT) do
        current = @url
        (MAX_REDIRECTS + 1).times do
          outcome = follow(current)
          return outcome if outcome.is_a?(Result)

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
      http.open_timeout = OPEN_TIMEOUT
      http.read_timeout = READ_TIMEOUT

      http.start do
        request = Net::HTTP::Get.new(uri, "Accept" => "image/*", "User-Agent" => "VekooCatalog/1.0")
        http.request(request) { |response| return interpret(response, uri) }
      end
    end

    # Devolve a imagem (Result) ou a próxima URL (String).
    def interpret(response, uri)
      case response
      when Net::HTTPRedirection
        location = response["location"]
        raise Refused, "redirecionamento sem destino" if location.blank?

        URI.join(uri.to_s, percent_encode(location)).to_s
      when Net::HTTPSuccess
        Result.new(body: read_capped(response), content_type: response["content-type"].to_s.split(";").first.to_s.strip)
      else
        raise Refused, "status #{response.code}"
      end
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

    def parse(url)
      uri = URI.parse(percent_encode(url.to_s.strip))
      raise Refused, "esquema não permitido" unless uri.is_a?(URI::HTTP) && uri.hostname.present?
      raise Refused, "porta não permitida" unless ALLOWED_PORTS.include?(uri.port)
      raise Refused, "credencial na URL" if uri.userinfo.present?

      uri
    rescue URI::InvalidURIError => e
      raise Refused, "URL inválida: #{e.message}"
    end

    # Nome de arquivo com acento ou espaço é comum em URL de loja, e o `URI` não aceita
    # cru. Só o que está fora do ASCII visível: um `%20` que já veio codificado fica como
    # está, em vez de virar `%2520`.
    def percent_encode(text)
      text.gsub(/[^\x21-\x7E]/) { |char| char.bytes.map { |byte| format("%%%02X", byte) }.join }
    end

    # Um único endereço interno recusa o host inteiro: é assim que o DNS de quem ataca
    # misturaria um IP público com um interno.
    def public_address_of(host)
      addresses = self.class.resolve(host)
      raise Refused, "host não resolve" if addresses.empty?

      internal = addresses.find { |address| internal_address?(address) }
      raise Refused, "endereço interno: #{internal}" if internal

      addresses.first
    end

    def internal_address?(address)
      ip = IPAddr.new(address.split("%").first)
      ip = ip.native if ip.ipv4_mapped?

      ip.private? || ip.loopback? || ip.link_local? || BLOCKED_RANGES.any? { |range| range.include?(ip) }
    rescue IPAddr::InvalidAddressError
      true
    end
  end
end
