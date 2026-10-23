# Uma logo da marca como a tela a vê: as variantes (os ids dos arquivos, que
# a tela acha em `assets`), de onde veio e o que dá para baixar.
class BrandLogoSerializer < ApplicationSerializer
  SIZES = [ 1024, 2048 ].freeze

  def self.many(logos, primary:)
    logos.map { |logo| one(logo, primary: primary&.id == logo.id) }
  end

  def self.one(logo, primary: false)
    {
      id: logo.id,
      primary: primary,
      source: logo.source,
      origin: logo.origin,
      style: logo.style,
      formats: logo.svg? ? %w[svg png] : %w[png],
      variants: logo.variants.transform_values(&:id),
      downloads: downloads(logo),
      createdAt: epoch_ms(logo.created_at)
    }
  end

  # O que dá para baixar de cada variante. SVG: o original e o PNG nos dois
  # tamanhos. PNG: só reduz — ampliar um raster pequeno entregaria um PNG
  # borrado com cara de 2048 —, então sai o original e o 1024 quando cabe.
  def self.downloads(logo)
    logo.variants.flat_map do |variant, asset|
      if asset.content_type == "image/svg+xml"
        [ { variant: variant, format: "svg", size: nil } ] +
          SIZES.map { |size| { variant: variant, format: "png", size: size } }
      else
        width = asset.width.to_i
        smaller = SIZES.select { |size| size < width }
        smaller.map { |size| { variant: variant, format: "png", size: size } } +
          [ { variant: variant, format: "png", size: SIZES.include?(width) ? width : nil } ]
      end
    end
  end
end
