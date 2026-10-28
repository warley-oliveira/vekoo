require "ipaddr"
require "net/http"
require "resolv"

module References
  # Baixa a imagem de uma URL direta (o link do arquivo, não a página do
  # post) para a análise. Instagram e TikTok não entram aqui: a página do post
  # pede login e raspar fere os termos — para eles a curadoria envia o print.
  #
  # É a única chamada de rede para um endereço que alguém digitou, então é
  # fechada: só https, o host tem que resolver **só** para endereço público
  # (nada de rede interna, metadados de nuvem, loopback), a conexão vai para o
  # IP conferido (sem segunda resolução no meio — DNS rebinding), cada
  # redirecionamento é conferido de novo, e o corpo tem teto de tamanho.
  class FetchImage
    MAX_REDIRECTS = 3
    TIMEOUT = 10

    # Os blocos que não são internet pública (além dos que o IPAddr já sabe:
    # privado, loopback, link-local).
    BLOCKED = %w[
      0.0.0.0/8 100.64.0.0/10 192.0.0.0/24 192.0.2.0/24 198.18.0.0/15 198.51.100.0/24
      203.0.113.0/24 224.0.0.0/4 240.0.0.0/4 255.255.255.255/32
      ::/128 ::1/128 64:ff9b::/96 100::/64 2001:db8::/32 fc00::/7 fe80::/10 ff00::/8
    ].map { |block| IPAddr.new(block) }.freeze

    Result = Struct.new(:data, :content_type, :filename, keyword_init: true)

    # `code`: urlRefused (endereço não permitido) | urlNotImage | urlFailed.
    class Refused < StandardError
      attr_reader :code

      def initialize(code, message = code)
        @code = code
        super(message)
      end
    end

    # `transport`: (uri, ip) → [status, headers, body]. Costura dos testes —
    # o padrão fala com a rede pelo Net::HTTP.
    def self.call(url, resolver: Resolv, transport: nil)
      new(resolver, transport || method(:http_get)).call(url)
    end

    def initialize(resolver, transport)
      @resolver = resolver
      @transport = transport
    end

    def call(url)
      uri = parse(url)
      (MAX_REDIRECTS + 1).times do
        status, headers, body = @transport.call(uri, public_ip!(uri.hostname))
        if (300..399).cover?(status)
          uri = parse(URI.join(uri.to_s, headers["location"].to_s).to_s)
          next
        end
        raise Refused.new("urlFailed", "HTTP #{status}") unless status == 200

        type = headers["content-type"].to_s.split(";").first.to_s.strip.downcase
        raise Refused.new("urlNotImage", type) unless type.start_with?("image/")

        return Result.new(data: body, content_type: type, filename: File.basename(uri.path.presence || "imagem"))
      end
      raise Refused.new("urlFailed", "redirecionamentos demais")
    end

    private

    def parse(url)
      uri = URI.parse(url.to_s.strip)
      raise Refused, "urlRefused" unless uri.is_a?(URI::HTTPS) && uri.hostname.present? && uri.userinfo.nil?

      uri
    rescue URI::InvalidURIError
      raise Refused, "urlRefused"
    end

    # Todos os endereços do host têm que ser públicos — um só interno basta
    # para recusar, senão a segunda resolução escolheria por nós.
    def public_ip!(host)
      addresses = literal_ip?(host) ? [ host ] : @resolver.getaddresses(host).map(&:to_s)
      raise Refused, "urlRefused" if addresses.empty? || addresses.any? { |address| internal?(address) }

      addresses.first
    rescue Resolv::ResolvError
      raise Refused, "urlRefused"
    end

    def literal_ip?(host)
      IPAddr.new(host)
      true
    rescue IPAddr::InvalidAddressError
      false
    end

    def internal?(address)
      ip = IPAddr.new(address)
      ip = ip.native if ip.ipv4_mapped?
      ip.private? || ip.loopback? || ip.link_local? || BLOCKED.any? { |block| block.family == ip.family && block.include?(ip) }
    rescue IPAddr::InvalidAddressError
      true
    end

    def self.http_get(uri, ip)
      http = Net::HTTP.new(uri.hostname, uri.port)
      http.ipaddr = ip
      http.use_ssl = true
      http.open_timeout = TIMEOUT
      http.read_timeout = TIMEOUT
      http.start do
        request = Net::HTTP::Get.new(uri, "Accept" => "image/*", "User-Agent" => "Vekoo-Referencias/1.0")
        http.request(request) do |response|
          body = +""
          response.read_body do |chunk|
            body << chunk
            raise Refused.new("urlFailed", "arquivo grande demais") if body.bytesize > Images::MAX_BYTES
          end
          headers = response.each_header.to_h
          return [ response.code.to_i, headers, body ]
        end
      end
    rescue Net::OpenTimeout, Net::ReadTimeout, SocketError, OpenSSL::SSL::SSLError, Errno::ECONNREFUSED, Errno::EHOSTUNREACH => e
      raise Refused.new("urlFailed", e.class.name)
    end
  end
end
