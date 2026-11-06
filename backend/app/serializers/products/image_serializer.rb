module Products
  class ImageSerializer < ApplicationSerializer
    # `url` e `thumbUrl` são relativos quando a imagem é nossa (`hosted`), do mesmo jeito
    # que UploadSerializer: o front resolve contra o endereço da API. Externa, é a URL
    # original, sem miniatura própria.
    def self.one(image)
      {
        id: image.id,
        url: image.public_url,
        thumbUrl: image.thumb_url,
        alt: image.alt,
        position: image.position,
        hosted: image.hosted?,
        createdAt: epoch_ms(image.created_at)
      }
    end
  end
end
