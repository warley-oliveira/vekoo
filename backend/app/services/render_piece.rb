# Gera as imagens de uma peça: valida os valores contra o manifesto, resolve
# as refs na versão publicada (fato pendente barra aqui), compõe cada quadro
# e guarda a proveniência. Falha limpa: o erro vira `piece.error` com código
# e o fato que bloqueou, nunca uma exceção solta no job.
class RenderPiece
  attr_reader :piece

  def initialize(piece)
    @piece = piece
  end

  def call
    piece.update!(status: "rendering", error: nil)

    tokens = Engines::Tokens.new(piece.brand_core)
    entry = Engines::Registry.fetch(piece.engine_id)
    values = validated_values(entry.manifest, tokens)
    refs = Engines::Refs.resolve(entry.manifest, values, tokens)

    renderer = entry.renderer.new(manifest: entry.manifest, tokens: tokens, values: values, refs: refs, format: piece.format)
    frames = renderer.render_all

    store(frames)
    piece.update!(
      status: "ready",
      rendered_at: Time.current,
      brand_core_version: tokens.version_record,
      provenance: {
        "brandCoreVersion" => tokens.version,
        "brandCoreVersionId" => tokens.version_record&.id,
        "refs" => refs.values.map(&:to_h),
        "frames" => frames.length,
        "renderedAt" => (Time.current.to_f * 1000).round
      }
    )
    broadcast
    piece
  rescue Engines::GenerationError => e
    fail_with(e.as_json)
  rescue StandardError => e
    Rails.logger.error("render piece #{piece.id}: #{e.class}: #{e.message[0, 200]}")
    fail_with("code" => "renderFailed", "message" => e.class.name)
  end

  # A prévia do formulário: mesma composição, sem persistir — só o primeiro
  # quadro. Levanta `GenerationError` para a tela explicar o que barrou.
  def self.preview(brand_core, engine_id, raw_values, format)
    tokens = Engines::Tokens.new(brand_core)
    entry = Engines::Registry.fetch(engine_id)
    raise Engines::GenerationError.new("formatUnsupported", nil, format: format) unless entry.manifest.supports?(format)

    result = Engines::Values.call(entry.manifest, raw_values, tokens: tokens)
    raise Engines::GenerationError.new("valuesInvalid", nil, errors: result.errors) unless result.valid?

    refs = Engines::Refs.resolve(entry.manifest, result.values, tokens)
    renderer = entry.renderer.new(manifest: entry.manifest, tokens: tokens, values: result.values, refs: refs, format: format)
    # Só o primeiro quadro: a prévia precisa voltar rápido.
    first = renderer.frames.first
    width, height = entry.manifest.dimensions(format)
    canvas = Engines::Canvas.new(width: width, height: height, tokens: tokens)
    renderer.render(canvas, first)
    canvas.to_png
  end

  private

  def validated_values(manifest, tokens)
    result = Engines::Values.call(manifest, piece.values, tokens: tokens)
    raise Engines::GenerationError.new("valuesInvalid", nil, errors: result.errors) unless result.valid?

    result.values
  end

  def store(frames)
    piece.images.purge if piece.images.attached?
    frames.each_with_index do |png, index|
      piece.images.attach(
        io: StringIO.new(png),
        filename: format("%s-%02d.png", piece.engine_id, index + 1),
        content_type: "image/png"
      )
    end
  end

  def fail_with(error)
    piece.update!(status: "failed", error: error)
    broadcast
    piece
  end

  def broadcast
    PieceChannel.broadcast_to(piece.organization, PieceSerializer.event(piece.reload))
  end
end
