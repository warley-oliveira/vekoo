# frozen_string_literal: true

# Normaliza URLs de mídia antes de elas irem para o parâmetro `link` da Meta.
#
# O CDN interno da Meta (scontent.whatsapp.net e vizinhos) serve preview
# assinado por sessão: a URL abre no browser logado, mas o downloader da
# própria Meta leva 403 nela e o envio falha depois, no callback, com o erro
# 131053 ("Media upload error"). Toda URL que sai daqui precisa passar por
# esse filtro.
module PublicMediaUrl
  extend ActiveSupport::Concern

  META_CDN_HOST_PATTERN = /(?:\A|\.)(?:whatsapp\.net|fbcdn\.net|fbsbx\.com)\z/i

  private

  # @param url [String, nil]
  # @return [String, nil] a URL normalizada, ou nil quando ela não serve como
  #   origem pública de mídia
  def public_media_url(url)
    decoded = decode_escaped_url(url)
    return nil if decoded.blank? || meta_cdn_url?(decoded)

    decoded
  end

  # A Meta devolve URLs com os `&` da querystring escapados como sequências
  # Unicode literais (`\uXXXX`) dentro do JSON.
  def decode_escaped_url(url)
    return nil if url.blank?

    url.to_s.gsub(/\\u([0-9a-fA-F]{4})/) { [ ::Regexp.last_match(1).hex ].pack("U") }
  end

  def meta_cdn_url?(url)
    host = URI.parse(url).host
    host.present? && host.match?(META_CDN_HOST_PATTERN)
  rescue URI::InvalidURIError
    false
  end
end
