# frozen_string_literal: true

module Media
  # Normaliza a referência de uma mídia: a URL completa, o caminho da rota proxy do Active
  # Storage (é o que fica guardado nas mensagens) ou a key nua do blob, para que o front
  # possa pedir metadados/download por ID.
  module AssetUrl
    # Keys do ActiveStorage são base36 de 28 chars; a faixa é folgada para
    # tolerar keys de outros geradores.
    KEY_FORMAT = /\A[a-z0-9]{20,64}\z/
    BLOB_PATH = %r{/rails/active_storage/blobs/(?:redirect/|proxy/)?([^/]+)/}

    module_function

    # O próprio backend mais o que a operação liberar em MEDIA_PROXY_ALLOWED_HOSTS. Sem
    # lista, este endpoint viraria um proxy aberto (SSRF).
    def allowed_hosts
      extra = ENV.fetch("MEDIA_PROXY_ALLOWED_HOSTS", "").split(",").map { |host| host.strip.downcase }
      ([ primary_host ] + extra.reject(&:blank?)).uniq
    end

    def primary_host
      URI.parse(Storage.backend_url).host.to_s.downcase
    end

    # @return [URI::HTTP, nil] nil quando a referência é inválida.
    def parse(reference)
      value = reference.to_s.strip
      return nil if value.blank?
      return URI.parse("#{Storage.backend_url}/#{value}") if value.match?(KEY_FORMAT)
      return URI.parse("#{Storage.backend_url}#{value}") if value.start_with?("/")

      uri = URI.parse(value)
      return nil unless uri.is_a?(URI::HTTP) || uri.is_a?(URI::HTTPS)
      return nil if uri.host.blank?

      uri
    rescue URI::InvalidURIError
      nil
    end

    def allowed?(uri)
      allowed_hosts.include?(uri.host.to_s.downcase)
    end

    REDIRECT_CODES = [ 301, 302, 303, 307, 308 ].freeze
    MAX_REDIRECTS = 3

    # Sobe a requisição seguindo redirect à mão: o destino de cada salto também tem de estar na
    # lista, senão um host liberado que redirecione para fora escaparia dela (SSRF).
    #
    # @return [HTTParty::Response, nil] nil quando um redirect sai da lista ou passa do teto
    def fetch(method, uri, **options)
      (MAX_REDIRECTS + 1).times do
        response = HTTParty.public_send(method, uri.to_s, follow_redirects: false, **options)
        return response unless REDIRECT_CODES.include?(response.code)

        location = response.headers["location"]
        return response if location.blank?

        uri = URI.join(uri.to_s, location)
        return nil unless allowed?(uri)
      end

      nil
    end

    # O ID do objeto: o último segmento do caminho.
    def key_from(uri)
      key = File.basename(uri.path.to_s)
      key.presence
    end

    # O blob dono de uma URL da rota do Active Storage, quando é uma.
    def blob_from(uri)
      signed_id = uri.path.to_s[BLOB_PATH, 1]
      signed_id && ActiveStorage::Blob.find_signed(signed_id)
    rescue ActiveSupport::MessageVerifier::InvalidSignature
      nil
    end
  end
end
