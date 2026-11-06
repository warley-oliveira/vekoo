# A mídia a enviar por um conector: tipo, nome, legenda e de onde sai o arquivo
# (`media_url` pública, ou `attachment`, caminho local para quem manda multipart).
class MediaMessageDto
  attr_accessor :media_type, :file_name, :caption, :attachment, :attachment_id, :media_url, :original_media_content

  # media_type: image, audio, video, document
  def initialize(media_type, file_name, attachment_path = nil, attachment_id = nil, caption = nil, media_url: nil)
    @media_type = media_type
    @file_name = file_name
    @caption = caption
    @attachment = attachment_path
    @attachment_id = attachment_id
    @media_url = media_url
  end

  def as_json(_options = {})
    {
      mediatype: @media_type,
      fileName: @file_name,
      caption: @caption,
      media: media_url
    }
  end

  # Sempre absoluta: é o provedor quem vai baixar.
  def media_url
    url = @media_url.presence || Media::AttachmentLookup.find(attachment_id)&.file_url
    Media::Storage.public_url(url)
  end
end
