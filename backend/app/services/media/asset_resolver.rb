# frozen_string_literal: true

module Media
  # Resolve os metadados de uma mídia a partir da referência (ver Media::AssetUrl).
  #
  # Fonte primária: `active_storage_blobs`, que guarda o que o armazenamento não tem:
  # nome original do arquivo, checksum e o `metadata` do analyzer (largura, altura, duração).
  #
  # Fonte secundária: um HEAD na origem, para mídia de host liberado que não tem blob aqui.
  # Nesse caso o nome é sintetizado a partir da key + extensão inferida do mime type.
  class AssetResolver
    OPEN_TIMEOUT = 5
    READ_TIMEOUT = 10
    FALLBACK_TYPE = 'application/octet-stream'

    Asset = Struct.new(
      :key, :filename, :content_type, :byte_size, :checksum,
      :created_at, :width, :height, :duration, :source, :blob,
      keyword_init: true
    ) do
      # Payload para a API — sem o blob, que é objeto interno.
      def to_h
        super.except(:blob).compact
      end
    end

    def initialize(reference)
      @reference = reference
    end

    # @return [Asset, nil] nil quando a referência é inválida, o host não é
    #   permitido ou o objeto não existe.
    def call
      uri = AssetUrl.parse(reference)
      return nil if uri.nil? || !AssetUrl.allowed?(uri)

      blob = AssetUrl.blob_from(uri)
      return from_blob(blob) if blob

      key = AssetUrl.key_from(uri)
      return nil if key.blank?

      from_active_storage(key) || from_origin(uri, key)
    end

    private

    attr_reader :reference

    def from_active_storage(key)
      blob = ActiveStorage::Blob.find_by(key: key)
      blob && from_blob(blob)
    end

    def from_blob(blob)
      key = blob.key
      metadata = blob.metadata || {}

      Asset.new(
        key: key,
        filename: blob.filename.to_s.presence || synthesized_filename(key, blob.content_type),
        content_type: blob.content_type.presence || FALLBACK_TYPE,
        byte_size: blob.byte_size,
        checksum: blob.checksum,
        created_at: blob.created_at,
        width: metadata['width'],
        height: metadata['height'],
        duration: metadata['duration'],
        source: 'active_storage',
        blob: blob
      )
    end

    def from_origin(uri, key)
      response = AssetUrl.fetch(:head, uri, timeout: READ_TIMEOUT, open_timeout: OPEN_TIMEOUT)
      return nil unless response&.success?

      content_type = header_content_type(response)

      Asset.new(
        key: key,
        filename: synthesized_filename(key, content_type),
        content_type: content_type,
        byte_size: response.headers['content-length']&.to_i,
        checksum: response.headers['etag']&.delete('"'),
        created_at: parse_time(response.headers['last-modified']),
        source: 'origin'
      )
    # Qualquer falha de rede ou TLS, não só as mais comuns: uma conexão derrubada no meio
    # (ECONNRESET, EOFError) ou um certificado ruim não podem virar 500.
    rescue StandardError => e
      Rails.logger.error("[Media::AssetResolver] HEAD #{uri.host} failed: #{e.class} #{e.message}")
      nil
    end

    def header_content_type(response)
      response.headers['content-type'].to_s.split(';').first.presence || FALLBACK_TYPE
    end

    # A key do armazenamento não tem extensão; sem ela o
    # SO não sabe abrir o arquivo baixado.
    def synthesized_filename(key, content_type)
      extension = MiniMime.lookup_by_content_type(content_type.to_s)&.extension
      extension.present? ? "#{key}.#{extension}" : key
    end

    def parse_time(value)
      Time.httpdate(value.to_s)
    rescue ArgumentError
      nil
    end
  end
end
