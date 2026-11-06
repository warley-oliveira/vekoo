# frozen_string_literal: true

module Media
  # Baixa uma mídia pelo lado do servidor e a entrega pela API. Serve à tela para baixar com
  # o nome original e para mídia de host externo sem CORS: quem não está sujeito à política
  # de CORS é o servidor.
  #
  # Os metadados vêm do Media::AssetResolver, que resolve a referência para o blob do
  # Active Storage, de onde saem o nome original do arquivo e o content type corretos.
  #
  # Segurança: só hosts na lista do Media::AssetUrl são buscados, senão o endpoint viraria
  # um proxy aberto (SSRF).
  class ProxyDownloadService
    MAX_BYTES     = 100.megabytes
    OPEN_TIMEOUT  = 5
    READ_TIMEOUT  = 30
    FALLBACK_TYPE = 'application/octet-stream'

    Result = Struct.new(:success, :body, :asset, :error, keyword_init: true) do
      def success?
        success
      end

      def filename
        asset&.filename
      end

      def content_type
        asset&.content_type
      end
    end

    def initialize(reference)
      @reference = reference
    end

    def call
      uri = AssetUrl.parse(reference)
      return failure(:invalid_url) if uri.nil?
      return failure(:host_not_allowed) unless AssetUrl.allowed?(uri)

      asset = AssetResolver.new(reference).call
      return failure(:not_found) if asset.nil?
      return failure(:too_large) if asset.byte_size.to_i > MAX_BYTES

      asset.blob ? from_blob(asset) : from_http(asset, uri)
    end

    private

    attr_reader :reference

    def from_blob(asset)
      Result.new(success: true, body: asset.blob.download, asset: asset)
    rescue ActiveStorage::FileNotFoundError
      Rails.logger.warn("[Media::ProxyDownloadService] blob #{asset.key} missing at storage")
      failure(:not_found)
    end

    # Mídia de host liberado que não tem blob aqui: busca via HTTP a partir do servidor,
    # onde CORS não existe.
    def from_http(asset, uri)
      response = HTTParty.get(
        uri.to_s,
        timeout: READ_TIMEOUT,
        open_timeout: OPEN_TIMEOUT,
        follow_redirects: true,
        limit: 3
      )
      return failure(:upstream_error) unless response.success?

      body = response.body.to_s
      return failure(:too_large) if body.bytesize > MAX_BYTES

      Result.new(success: true, body: body, asset: asset)
    rescue HTTParty::Error, Net::OpenTimeout, Net::ReadTimeout, SocketError, Errno::ECONNREFUSED => e
      Rails.logger.error("[Media::ProxyDownloadService] GET #{uri.host} failed: #{e.class} #{e.message}")
      failure(:upstream_error)
    end

    def failure(error)
      Result.new(success: false, error: error)
    end
  end
end
