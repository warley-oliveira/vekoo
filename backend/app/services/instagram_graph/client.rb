require "net/http"

module InstagramGraph
  # A porta para a Instagram Graph API — o **único** lugar do projeto que fala
  # com o Meta, e a costura dos testes (`transport:`).
  #
  # Business Discovery: a conta profissional da Vekoo (`META_IG_USER_ID`) lê os
  # posts públicos de outra conta profissional pelo @. Conta pessoal ou privada
  # não responde. O token vai no cabeçalho `Authorization`, nunca na URL — ele
  # não aparece em log nenhum.
  #
  # Configuração (DEPLOY.md §2): META_ACCESS_TOKEN, META_IG_USER_ID,
  # META_APP_ID + META_APP_SECRET (só para conferir o token) e, opcional,
  # META_GRAPH_VERSION — sem ela vale a versão padrão do app.
  class Client
    HOST = "graph.facebook.com"
    TIMEOUT = 20
    # Os ~50 posts mais recentes da conta.
    LIMIT = 50
    # O Meta pode devolver menos do que o pedido por página; o cursor segue,
    # até este teto de páginas por conta (com a página no piso, 100 posts são 10).
    MAX_PAGES = 12
    # "Please reduce the amount of data you're asking for" (código 1, HTTP
    # 500): o peso é das lâminas — 50 posts de uma conta de carrosséis são
    # ~300 mídias — e depende da carga do Meta (a mesma consulta passa e falha
    # minutos depois). A página cai pela metade, até este piso, e o cursor
    # segue de onde parou.
    SHRINK_CODE = 1
    MIN_PAGE = 10
    ACCOUNT_FIELDS = %w[username name followers_count media_count].freeze
    MEDIA_FIELDS = %w[id caption media_type media_product_type like_count comments_count permalink media_url thumbnail_url timestamp].freeze
    CHILD_FIELDS = %w[id media_type media_url thumbnail_url].freeze
    # O @ entra na sintaxe de campos da Graph API: só o que um @ pode ter.
    USERNAME = /\A[a-z0-9._]{1,30}\z/
    CURSOR = /\A[\w\-=]+\z/

    # Os códigos de limite de taxa do Meta (Graph e Instagram).
    RATE_LIMIT_CODES = [ 4, 17, 32, 613, 80002 ].freeze
    # Sem estimativa no cabeçalho, uma hora — é a janela do limite da plataforma.
    DEFAULT_RETRY_MINUTES = 60

    Account = Struct.new(:username, :name, :followers_count, :media_count, keyword_init: true)
    Child = Struct.new(:id, :media_type, :media_url, :thumbnail_url, keyword_init: true) do
      def video? = media_type == "VIDEO"
    end
    # `caption` só existe em memória: quem chama usa e descarta.
    Media = Struct.new(:id, :caption, :media_type, :product_type, :like_count, :comments_count,
      :permalink, :media_url, :thumbnail_url, :posted_at, :children, keyword_init: true) do
      def video? = media_type == "VIDEO"
      def carousel? = media_type == "CAROUSEL_ALBUM"
      def reels? = product_type == "REELS"
    end
    Discovery = Struct.new(:account, :media, keyword_init: true)

    # `code`: notConfigured | tokenInvalid | rateLimited | permissionDenied |
    # accountUnavailable (não existe, ou não é conta profissional pública) |
    # failed. `retry_after` em minutos, no limite de taxa.
    class Error < StandardError
      attr_reader :code, :graph_code, :retry_after

      def initialize(code, message = code, graph_code: nil, retry_after: nil)
        @code = code
        @graph_code = graph_code
        @retry_after = retry_after
        super(message)
      end
    end

    def self.token = ENV["META_ACCESS_TOKEN"].presence
    def self.ig_user_id = ENV["META_IG_USER_ID"].presence
    def self.version = ENV["META_GRAPH_VERSION"].presence
    def self.configured? = token.present? && ig_user_id.present?

    def self.username(value)
      name = value.to_s.strip.delete_prefix("@").downcase
      name if name.match?(USERNAME)
    end

    # `transport`: (uri, headers) → [status, headers, body].
    def initialize(transport: nil)
      @transport = transport || method(:http_get)
    end

    # A conta e os posts dela, mais recentes primeiro (com os filhos de cada
    # carrossel). Pagina pelo cursor até `limit`.
    def discover(username, limit: LIMIT)
      raise Error, "notConfigured" unless self.class.configured?

      name = self.class.username(username) or raise Error, "accountUnavailable"
      account = nil
      media = []
      after = nil
      page_size = limit
      pages = 0
      while pages < MAX_PAGES
        wanted = [ limit - media.size, page_size ].min
        begin
          discovery = page(name, wanted, after)
        rescue Error => e
          raise unless e.graph_code == SHRINK_CODE && wanted > MIN_PAGE

          page_size = [ wanted / 2, MIN_PAGE ].max
          next
        end
        pages += 1

        account ||= Account.new(**discovery.slice(*ACCOUNT_FIELDS).symbolize_keys)
        batch = Array(discovery.dig("media", "data"))
        media.concat(batch.map { |raw| build_media(raw) })
        after = discovery.dig("media", "paging", "cursors", "after").to_s
        break if batch.empty? || media.length >= limit || !after.match?(CURSOR)
      end
      Discovery.new(account: account, media: media.first(limit))
    end

    # O estado do token (`debug_token`): validade, vencimento, permissões.
    def debug_token
      app_id = ENV["META_APP_ID"].presence
      secret = ENV["META_APP_SECRET"].presence
      raise Error, "notConfigured" unless self.class.token && app_id && secret

      get("debug_token", { input_token: self.class.token }, token: "#{app_id}|#{secret}").fetch("data", {})
    end

    private

    def page(name, size, after)
      media = "media.limit(#{size})#{".after(#{after})" if after}"
      fields = "business_discovery.username(#{name}){#{ACCOUNT_FIELDS.join(',')}," \
        "#{media}{#{MEDIA_FIELDS.join(',')},children{#{CHILD_FIELDS.join(',')}}}}"
      get(self.class.ig_user_id, { fields: fields })["business_discovery"] or raise Error, "accountUnavailable"
    end

    def build_media(raw)
      children = Array(raw.dig("children", "data")).map { |child|
        Child.new(id: child["id"].to_s, media_type: child["media_type"], media_url: child["media_url"], thumbnail_url: child["thumbnail_url"])
      }
      Media.new(
        id: raw["id"].to_s, caption: raw["caption"], media_type: raw["media_type"], product_type: raw["media_product_type"],
        like_count: raw["like_count"], comments_count: raw["comments_count"], permalink: raw["permalink"],
        media_url: raw["media_url"], thumbnail_url: raw["thumbnail_url"],
        posted_at: (Time.iso8601(raw["timestamp"]) rescue nil), children: children
      )
    end

    def get(path, params, token: self.class.token)
      prefix = self.class.version ? "/#{self.class.version}" : ""
      uri = URI::HTTPS.build(host: HOST, path: "#{prefix}/#{path}", query: URI.encode_www_form(params))
      status, headers, body = @transport.call(uri, { "Authorization" => "Bearer #{token}" })
      payload = JSON.parse(body.presence || "{}")
      return payload if status == 200 && !payload.key?("error")

      raise classify(payload["error"] || {}, headers || {}, status)
    rescue JSON::ParserError
      raise Error.new("failed", "resposta não era JSON (HTTP #{status})")
    end

    # O erro do Meta → o código que a tela conhece. A mensagem guardada é a do
    # Meta (sem token: ele nunca vai na URL).
    def classify(error, headers, status)
      code = error["code"].to_i
      message = error["message"].to_s.first(200)
      kind =
        if code == 190 then "tokenInvalid"
        elsif RATE_LIMIT_CODES.include?(code) then "rateLimited"
        elsif code == 10 || (200..299).cover?(code) then "permissionDenied"
        elsif code == 110 || (code == 100 && message.match?(/user|username|business|professional/i)) then "accountUnavailable"
        else "failed"
        end
      retry_after = kind == "rateLimited" ? retry_minutes(headers) : nil
      Error.new(kind, "HTTP #{status} (##{code}) #{message}", graph_code: code, retry_after: retry_after)
    end

    def retry_minutes(headers)
      usage = JSON.parse(headers["x-business-use-case-usage"].to_s.presence || "{}")
      minutes = usage.values.flatten.filter_map { |entry| entry["estimated_time_to_regain_access"].to_i if entry.is_a?(Hash) }.max
      minutes&.positive? ? minutes : DEFAULT_RETRY_MINUTES
    rescue JSON::ParserError
      DEFAULT_RETRY_MINUTES
    end

    def http_get(uri, headers)
      request = Net::HTTP::Get.new(uri, headers)
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: TIMEOUT, open_timeout: 10) { |http| http.request(request) }
      [ response.code.to_i, response.each_header.to_h, response.body ]
    rescue Net::OpenTimeout, Net::ReadTimeout, SocketError, OpenSSL::SSL::SSLError, Errno::ECONNREFUSED => e
      raise Error.new("failed", e.class.name)
    end
  end
end
