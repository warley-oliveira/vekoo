require "vips"

# Mede o ativo recém-enviado: largura, altura e — para PNG — se o fundo é
# transparente de verdade; SVG ganha o PNG que a tela mostra (`preview`).
# Roda na hora, não em job: a resposta do upload precisa sair com o alerta de
# fundo opaco, senão a pessoa só descobre depois. A foto enviada ganha também
# a descrição (`DescribeBrandAsset`) — essa, sim, em job.
class AnalyzeBrandAsset
  def self.call(asset, io)
    new(asset, io).call
  end

  def initialize(asset, io)
    @asset = asset
    @io = io
  end

  def call
    measure
    DescribeBrandAssetJob.perform_later(@asset.id) if DescribeBrandAsset.describable?(@asset)
  end

  private

  def measure
    attributes = {}
    if @asset.content_type == "image/png"
      result = PngInspector.call(@io)
      attributes = { width: result.width, height: result.height, transparent: result.transparent } if result
    elsif @asset.content_type == "image/svg+xml"
      attributes = { transparent: transparent_corners?(rasterize_svg) }
    elsif @asset.image?
      attributes = measure_with_active_storage
    end

    @asset.update_columns(attributes) if attributes.any?
  rescue StandardError => e
    # Sem medidas o ativo ainda serve; perder o upload por causa disso, não.
    Rails.logger.warn("brand asset #{@asset.id}: análise falhou (#{e.class})")
  end

  PREVIEW_WIDTH = 1024

  # O PNG que a tela mostra no lugar do SVG, com a transparência intacta.
  # Largura e altura ficam vazias: no SVG elas não dizem o tamanho do arquivo,
  # e o download conta com isso para rasterizar na largura pedida.
  def rasterize_svg
    image = Vips::Image.thumbnail_buffer(@asset.file.download, PREVIEW_WIDTH, height: PREVIEW_WIDTH)
    # As medidas já vão no blob: o render precisa da proporção antes de a
    # imagem carregar, e a análise do Active Storage roda depois, em job.
    @asset.preview.attach(ActiveStorage::Blob.create_and_upload!(
      io: StringIO.new(image.write_to_buffer(".png")), content_type: "image/png",
      filename: "#{File.basename(@asset.filename.to_s, '.*')}.png",
      metadata: { "width" => image.width, "height" => image.height, "analyzed" => true }
    ))
    image
  end

  # Vetor não garante fundo transparente: SVG exportado de prancheta (Affinity,
  # Illustrator) costuma trazer um retângulo do tamanho do desenho atrás da
  # logo. Os quatro cantos, um pouco para dentro da borda (que o
  # redimensionamento suaviza), dizem se há fundo.
  def transparent_corners?(image)
    return false unless image.has_alpha?

    alpha = image.extract_band(image.bands - 1)
    inset_x = [ (image.width * 0.02).ceil, image.width - 1 ].min
    inset_y = [ (image.height * 0.02).ceil, image.height - 1 ].min
    corners = [ [ inset_x, inset_y ], [ image.width - 1 - inset_x, inset_y ],
      [ inset_x, image.height - 1 - inset_y ], [ image.width - 1 - inset_x, image.height - 1 - inset_y ] ]
    corners.any? { |x, y| alpha.getpoint(x, y).first < 250 }
  end

  def measure_with_active_storage
    @asset.file.analyze unless @asset.file.analyzed?
    metadata = @asset.file.metadata
    { width: metadata["width"], height: metadata["height"] }.compact
  rescue StandardError
    {}
  end
end
