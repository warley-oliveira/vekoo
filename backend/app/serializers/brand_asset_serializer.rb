class BrandAssetSerializer < ApplicationSerializer
  # `url` é a rota proxy do **blob**, não de uma variante: variante sairia em
  # JPEG e mataria a transparência do logo — e fonte não tem variante.
  def self.one(asset)
    {
      id: asset.id,
      kind: asset.kind,
      variant: asset.variant,
      name: asset.filename,
      url: Rails.application.routes.url_helpers.rails_storage_proxy_url(asset.file, only_path: true),
      contentType: asset.content_type,
      width: asset.width,
      height: asset.height,
      # true/false quando o servidor conseguiu olhar o PNG; null é "não sei".
      transparent: asset.transparent,
      byteSize: asset.byte_size,
      createdAt: epoch_ms(asset.created_at)
    }
  end
end
