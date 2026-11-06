module Products
  # Baixa uma imagem cuja URL veio do cliente, a partir dos nossos servidores.
  #
  # Quem manda a planilha escolhe o endereço. As travas contra SSRF moram em `SafeHttp`,
  # que o motor de scripts também usa; aqui ficam só as escolhas do catálogo: portas
  # padrão, poucos saltos e resposta precisa ser sucesso.
  class RemoteImage
    Refused = SafeHttp::Refused

    Result = Struct.new(:body, :content_type, keyword_init: true)

    OPEN_TIMEOUT = 5
    READ_TIMEOUT = 15
    TOTAL_TIMEOUT = 30
    MAX_REDIRECTS = 3
    ALLOWED_PORTS = [ 80, 443 ].freeze
    HEADERS = { "Accept" => "image/*", "User-Agent" => "VekooCatalog/1.0" }.freeze

    def self.fetch(url, max_bytes:)
      new(url, max_bytes: max_bytes).fetch
    end

    # Separado para as specs não dependerem de DNS de verdade.
    def self.resolve(host)
      SafeHttp.resolve(host)
    end

    def initialize(url, max_bytes:)
      @url = url
      @max_bytes = max_bytes
    end

    def fetch
      response = SafeHttp.request(
        @url,
        max_bytes: @max_bytes,
        headers: HEADERS,
        ports: ALLOWED_PORTS,
        max_redirects: MAX_REDIRECTS,
        open_timeout: OPEN_TIMEOUT,
        read_timeout: READ_TIMEOUT,
        total_timeout: TOTAL_TIMEOUT,
        resolver: ->(host) { self.class.resolve(host) }
      )
      raise Refused, "status #{response.status}" unless response.success?

      Result.new(body: response.body, content_type: response.content_type)
    end
  end
end
