# frozen_string_literal: true

# Proxy autenticado de mídia: entrega pela API o arquivo de uma mensagem, com o nome
# original e `Content-Disposition: attachment`, inclusive de CDN externo sem CORS.
#
# Aceita tanto a URL ou caminho da mídia (`?url=`) quanto só o ID do objeto (`?key=`).
class MediaDownloadsController < PlatformController
  ERROR_STATUSES = {
    invalid_url: :unprocessable_entity,
    host_not_allowed: :forbidden,
    not_found: :not_found,
    too_large: :content_too_large,
    upstream_error: :bad_gateway
  }.freeze

  ERROR_CODES = {
    invalid_url: "invalidMediaUrl",
    host_not_allowed: "mediaHostNotAllowed",
    not_found: "notFound",
    too_large: "mediaTooLarge",
    upstream_error: "mediaUpstreamError"
  }.freeze

  # GET /media/download
  def show
    return render_missing_reference if media_reference.blank?

    result = Media::ProxyDownloadService.new(media_reference).call
    return render_media_error(result.error) unless result.success?

    send_data result.body,
              filename: result.filename,
              type: result.content_type,
              disposition: "attachment"
  end

  # GET /media/metadata
  #
  # Nome original, mime type, tamanho e dimensões sem baixar os bytes, para a tela
  # rotular o arquivo antes do download.
  def metadata
    return render_missing_reference if media_reference.blank?

    asset = Media::AssetResolver.new(media_reference).call
    return render_media_error(:not_found) if asset.nil?

    payload = asset.to_h.transform_keys { |key| key.to_s.camelize(:lower) }
    payload["createdAt"] = ApplicationSerializer.epoch_ms(asset.created_at) if asset.created_at

    render json: payload
  end

  private

  def media_reference
    params[:url].presence || params[:key].presence
  end

  def render_missing_reference
    render_error(status: :unprocessable_entity, code: "mediaReferenceRequired")
  end

  def render_media_error(error)
    render_error(status: ERROR_STATUSES.fetch(error, :unprocessable_entity), code: ERROR_CODES.fetch(error, "unprocessable"))
  end
end
