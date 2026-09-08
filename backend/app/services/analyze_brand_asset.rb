# Mede o ativo recém-enviado: largura, altura e — para PNG — se o fundo é
# transparente de verdade. Roda na hora, não em job: a resposta do upload
# precisa sair com o alerta de fundo opaco, senão a pessoa só descobre depois.
class AnalyzeBrandAsset
  def self.call(asset, io)
    new(asset, io).call
  end

  def initialize(asset, io)
    @asset = asset
    @io = io
  end

  def call
    attributes = {}
    if @asset.content_type == "image/png"
      result = PngInspector.call(@io)
      attributes = { width: result.width, height: result.height, transparent: result.transparent } if result
    elsif @asset.content_type == "image/svg+xml"
      # SVG não tem "fundo": é vetor, transparente por natureza.
      attributes = { transparent: true }
    elsif @asset.image?
      attributes = measure_with_active_storage
    end

    @asset.update_columns(attributes) if attributes.any?
  rescue StandardError => e
    # Sem medidas o ativo ainda serve; perder o upload por causa disso, não.
    Rails.logger.warn("brand asset #{@asset.id}: análise falhou (#{e.class})")
  end

  private

  def measure_with_active_storage
    @asset.file.analyze unless @asset.file.analyzed?
    metadata = @asset.file.metadata
    { width: metadata["width"], height: metadata["height"] }.compact
  rescue StandardError
    {}
  end
end
