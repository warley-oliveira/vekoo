class BrandAssetSerializer < ApplicationSerializer
  # `url` é a rota proxy do **blob**, não de uma variante: variante sairia em
  # JPEG e mataria a transparência do logo — e fonte não tem variante.
  def self.one(asset)
    {
      id: asset.id,
      kind: asset.kind,
      variant: asset.variant,
      # A logo (grupo de variantes) de que o arquivo faz parte.
      logoId: asset.logo_id,
      name: asset.filename,
      # SVG aparece pelo PNG rasterizado (`preview`); baixar o SVG é pela
      # rota da logo.
      url: blob_url(asset.display_file),
      contentType: asset.content_type,
      width: asset.width,
      height: asset.height,
      # true/false quando o servidor conseguiu olhar o PNG; null é "não sei".
      transparent: asset.transparent,
      # true quando foi a Vekoo que desenhou (o logotipo tipográfico de quem
      # não tem logo) — a tela oferece refazer, não avisa sobre transparência.
      generated: asset.generated,
      byteSize: asset.byte_size,
      createdAt: epoch_ms(asset.created_at)
    }
  end
end
