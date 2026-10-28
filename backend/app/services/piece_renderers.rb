# Os renderizadores de peça. Dois intérpretes da mesma geometria de layout:
# `Libvips` (no servidor, Pango) e `Chromium` (o React do front, num
# navegador sem tela). Quem escolhe é a pessoa, no seletor do front.
module PieceRenderers
  NAMES = %w[react libvips].freeze

  # Mude quando o **intérprete** mudar de um jeito que altere pixels (os dois
  # lados): é parte do checksum, e invalida o cache de render. Mudança de
  # geometria em `layouts/*.yml` já entra sozinha.
  REVISION = 3

  module_function

  # O renderizador de quem não escolheu: o libvips não depende de navegador.
  def default = NAMES.include?(ENV["PIECE_RENDERER"]) ? ENV["PIECE_RENDERER"] : "libvips"

  # Uma lâmina não pôde ser desenhada.
  class Failed < StandardError
    attr_reader :slide

    def initialize(message, slide: nil)
      super(message)
      @slide = slide
    end
  end

  # Tudo o que um renderizador precisa para desenhar uma versão, numa peça
  # só: o documento, o tema resolvido da marca publicada, os arquivos e a
  # geometria dos layouts usados. É o que o React recebe — no preview (com a
  # sessão) e no export (com o token).
  def payload(version)
    piece = version.piece
    document = version.document
    layout_ids = document["slides"].map { |slide| slide["layoutId"] }.uniq
    {
      "pieceId" => piece.id,
      "versionId" => version.id,
      "document" => document,
      "theme" => PieceDocument::Theme.call(piece.brand_core),
      "assets" => PieceDocument::Theme.assets(piece.brand_core, document),
      "layouts" => layout_ids.filter_map { |id| Layouts::Registry.find(id)&.as_json(locale: :"pt-BR") }
    }
  end

  # O passe do navegador sem tela: lê **uma** versão, por 10 minutos.
  def verifier = Rails.application.message_verifier("piece-render")

  def render_token(version) = verifier.generate(version.id, purpose: :render, expires_in: 10.minutes)

  def version_from_token(token) = verifier.verified(token.to_s, purpose: :render)

  def layouts_digest
    @layouts_digest ||= Digest::SHA256.hexdigest(
      Dir[Rails.root.join("layouts/*.yml")].sort.map { |path| File.read(path) }.join("\n") + REVISION.to_s
    )
  end

  # O que define os pixels de uma lâmina: ela mesma, o formato, o tema
  # resolvido (cores, fontes, logo), os arquivos que usa, a geometria e o
  # renderizador. Igual → o PNG anterior serve.
  def checksum(document, slide, theme, assets, renderer)
    used = assets.slice(*Array(slide["blocks"]).filter_map { |block| block["assetId"] })
    Digest::SHA256.hexdigest(JSON.generate(canonical([
      renderer, layouts_digest, document["format"], document["slides"].length,
      document["slides"].index { |s| s["id"] == slide["id"] }, slide.except("id"), theme, used.keys.sort
    ])))
  end

  # Chaves em ordem: o `jsonb` do Postgres devolve o mesmo documento com as
  # chaves noutra ordem, e o JSON (e o checksum) mudaria sem nada mudar.
  def canonical(value)
    case value
    when Hash then value.keys.map(&:to_s).sort.to_h { |key| [ key, canonical(value[key] || value[key.to_sym]) ] }
    when Array then value.map { |item| canonical(item) }
    else value
    end
  end


  # A foto em "cover" com o ponto focal no centro da caixa sempre que dá — a
  # mesma conta do `coverRect` do front. Devolve a imagem já recortada.
  def cover(source, width, height, focal)
    source = source.colourspace(:srgb) unless source.interpretation == :srgb
    source = source.bandjoin(255) unless source.has_alpha?
    rect = cover_rect(source.width, source.height, width, height, focal)
    scaled = source.resize(rect[:scale])
    scaled.crop(rect[:x].clamp(0, [ scaled.width - width, 0 ].max), rect[:y].clamp(0, [ scaled.height - height, 0 ].max),
      [ width, scaled.width ].min, [ height, scaled.height ].min)
  end

  # Escala e deslocamento (em px da imagem escalada) para cobrir a caixa com o
  # ponto focal o mais perto do centro possível.
  def cover_rect(source_w, source_h, box_w, box_h, focal)
    focal = (focal || {}).stringify_keys
    fx = focal.fetch("x", 0.5).to_f
    fy = focal.fetch("y", 0.5).to_f
    scale = [ box_w.to_f / source_w, box_h.to_f / source_h ].max
    scaled_w = source_w * scale
    scaled_h = source_h * scale
    x = (fx * scaled_w - box_w / 2.0).clamp(0, [ scaled_w - box_w, 0 ].max).round
    y = (fy * scaled_h - box_h / 2.0).clamp(0, [ scaled_h - box_h, 0 ].max).round
    { scale: scale, x: x, y: y }
  end
end
