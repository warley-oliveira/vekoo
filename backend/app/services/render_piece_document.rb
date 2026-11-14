# Gera os PNGs de uma versão do documento com o renderizador pedido. Lâmina
# cujo checksum já foi desenhado (nesta peça ou em qualquer outra) reusa o
# mesmo arquivo — editar a lâmina 3 de um carrossel não redesenha as outras.
#
# Falha limpa: o erro vai para `piece.error` com código e a lâmina que caiu.
class RenderPieceDocument
  attr_reader :piece, :renderer

  def initialize(piece, renderer: PieceRenderers.default, version: nil)
    @piece = piece
    @renderer = PieceRenderers::NAMES.include?(renderer.to_s) ? renderer.to_s : PieceRenderers.default
    @version = version || piece.current_version
  end

  def call
    document = @version.document
    theme = PieceDocument::Theme.call(piece.brand_core)
    assets = PieceDocument::Theme.assets(piece.brand_core, document)
    slides = document["slides"]

    plan = slides.each_with_index.map { |slide, position|
      checksum = PieceRenderers.checksum(document, slide, theme, assets, renderer)
      existing = @version.renders.find_by(renderer: renderer, position: position)
      reuse = existing&.checksum == checksum ? existing : PieceRender.where(checksum: checksum, renderer: renderer).first
      { slide: slide, position: position, checksum: checksum, existing: existing, reuse: reuse }
    }

    missing = plan.reject { |entry| entry[:reuse] }.map { |entry| entry[:position] }
    pngs = missing.any? ? draw(document, theme, missing) : {}

    PieceRender.transaction do
      plan.each do |entry|
        record = entry[:existing] || @version.renders.new(renderer: renderer, position: entry[:position])
        next if record.persisted? && record.checksum == entry[:checksum]

        drawn = pngs[entry[:position]]
        png = drawn&.dig(:png)
        image = png ? Vips::Image.new_from_buffer(png, "") : nil
        record.assign_attributes(
          slide_id: entry[:slide]["id"], checksum: entry[:checksum], rendered_at: Time.current,
          width: image&.width || entry[:reuse].width, height: image&.height || entry[:reuse].height,
          legibility: drawn ? drawn[:legibility] : entry[:reuse].legibility
        )
        if png
          record.file.attach(io: StringIO.new(png), filename: "lamina-#{entry[:position] + 1}.png", content_type: "image/png")
        else
          record.file.attach(entry[:reuse].file.blob)
        end
        record.save!
      end
      @version.renders.where(renderer: renderer).where("position >= ?", slides.length).destroy_all
    end

    piece.update!(error: nil, rendered_at: Time.current, provenance: piece.provenance.merge(
      "brandCoreVersion" => theme["brandCoreVersion"], "renderer" => renderer, "frames" => slides.length,
      "renderedAt" => (Time.current.to_f * 1000).round
    ))
    broadcast
    @version.renders.where(renderer: renderer).ordered
  rescue PieceRenderers::Failed => e
    fail_with("renderFailed", slide: e.slide, message: e.message)
  rescue StandardError => e
    Rails.logger.error("render documento #{piece.id}: #{e.class}: #{e.message[0, 200]}")
    fail_with("renderFailed", message: e.class.name)
  end

  private

  # { posição => { png:, legibility: } } das lâminas que faltam.
  def draw(document, theme, positions)
    case renderer
    when "libvips"
      vips = PieceRenderers::Libvips.new(piece.brand_core, theme: theme)
      positions.to_h { |position|
        slide = document["slides"][position]
        png = vips.render_slide(document, slide, position, document["slides"].length)
        [ position, { png: png, legibility: vips.legibility } ]
      }
    when "react"
      PieceRenderers::Chromium.render(@version, positions: positions).transform_values { |png| { png: png, legibility: nil } }
    end
  end

  def fail_with(code, **details)
    piece.update!(error: { "code" => code }.merge(details.transform_keys(&:to_s)))
    broadcast
    nil
  end

  def broadcast
    PieceChannel.broadcast_to(piece.organization, PieceSerializer.event(piece.reload))
  end
end
