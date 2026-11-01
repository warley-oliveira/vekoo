# O documento de uma peça — a peça **é** isto; a imagem é derivada dele por
# um renderizador. O espelho em TypeScript é `frontend/src/lib/piece-document.ts`.
#
# Três travas de marca moram na forma, não na boa vontade de quem edita:
#   - cor é **token** (`primary`, `surface`…), nunca hex — resolvido contra o
#     Brandcore publicado na hora do render;
#   - tipografia é **papel** (`display`, `body`…) mais um degrau relativo
#     (`sizeStep`, -2..+2), nunca nome de fonte ou px;
#   - posição é **slot** do layout. A exceção é escolha de quem edita: o
#     bloco arrastado ganha `frame` (x, y, largura, altura em px do canvas) e
#     sai do lugar do layout — sempre dentro do canvas; textos e logo, dentro
#     da área segura (`SAFE`). Trocar de layout devolve o bloco ao lugar.
#
# As chaves seguem o resto da API (camelCase), como o documento do Brandcore.
module PieceDocument
  SCHEMA_VERSION = 1

  # Formato → tamanho do canvas lógico. O carrossel é uma série de lâminas no
  # tamanho do retrato do feed.
  FORMATS = {
    "feed_square" => { "width" => 1080, "height" => 1080 },
    "feed_portrait" => { "width" => 1080, "height" => 1350 },
    "story" => { "width" => 1080, "height" => 1920 },
    "carousel" => { "width" => 1080, "height" => 1350 }
  }.freeze

  # Os tokens de cor de fundo e os papéis do Brandcore que cada um lê, em
  # ordem de preferência (a primeira cor da marca com aquele papel vale).
  COLOR_TOKENS = {
    "primary" => %w[darkBackground accent],
    "secondary" => %w[campaign accent muted],
    "accent" => %w[accent campaign],
    "surface" => %w[lightBackground]
  }.freeze

  # Papéis de texto → estilos de texto do Brandcore (`styles.roles[].key`).
  STYLE_ROLES = {
    "display" => "title",
    "headline" => "lede",
    "body" => "body",
    "label" => "kicker",
    "caption" => "footer"
  }.freeze

  SIZE_STEPS = (-2..2)
  # O degradê atrás do texto, por lâmina (`set_scrim`): sem, leve ou forte.
  # Ausente = o do layout (`Layouts::Geometry.scrim`).
  SCRIM_LEVELS = %w[none light strong].freeze
  LOGO_VARIANTS = %w[light dark].freeze
  IMAGE_FITS = %w[cover contain].freeze
  # Instagram: carrossel de 2 a 10 lâminas, legenda de até 2 200 caracteres e
  # 30 hashtags.
  CAROUSEL_SLIDES = (2..10)

  # A área segura de quem foi arrastado: a borda do post e, no story, as
  # faixas que a interface do Instagram cobre (perfil em cima, resposta
  # embaixo). Foto pode ir até a borda; texto e logo, não.
  SAFE = {
    "feed_square" => { "top" => 40, "right" => 40, "bottom" => 40, "left" => 40 },
    "feed_portrait" => { "top" => 40, "right" => 40, "bottom" => 40, "left" => 40 },
    "carousel" => { "top" => 40, "right" => 40, "bottom" => 40, "left" => 40 },
    "story" => { "top" => 220, "right" => 40, "bottom" => 280, "left" => 40 }
  }.freeze
  FRAME_MIN = 40
  CAPTION_MAX = 2_200
  HASHTAGS_MAX = 30

  UUID = /\A\h{8}-\h{4}-\h{4}-\h{4}-\h{12}\z/

  module_function

  def canvas_for(format) = FORMATS.fetch(format.to_s).dup

  # A cor da marca que um token de fundo representa (`{ "hex", "name",
  # "role" }`), ou nil se a paleta não tem nenhum dos papéis dele.
  def resolve_token(colors, token)
    COLOR_TOKENS.fetch(token.to_s, []).each do |role|
      color = Array(colors).find { |c| c["role"] == role && c["hex"].to_s.match?(BrandCore::Schema::HEX) }
      return color if color
    end
    nil
  end

  def uuid?(value) = value.to_s.match?(UUID)

  # A forma conhecida a partir do que vier (agente, editor, migração): ids
  # que faltam são criados, defaults do layout entram, chave estranha sai.
  # Não valida — quem diz o que está errado é o `Validator`.
  def normalize(raw, piece_id: nil, brand_id: nil, brand_core_version_id: nil)
    raw = (raw || {}).deep_stringify_keys
    format = FORMATS.key?(raw["format"].to_s) ? raw["format"].to_s : "feed_portrait"

    {
      "schemaVersion" => SCHEMA_VERSION,
      "pieceId" => piece_id || raw["pieceId"],
      "brandId" => brand_id || raw["brandId"],
      "brandCoreVersionId" => brand_core_version_id || raw["brandCoreVersionId"],
      "format" => format,
      "canvas" => canvas_for(format),
      "slides" => Array(raw["slides"]).map { |slide| clamp_slide(normalize_slide(slide), format) },
      "caption" => normalize_caption(raw["caption"]),
      "meta" => normalize_meta(raw["meta"])
    }
  end

  def clamp_slide(slide, format)
    slide["blocks"].each do |block|
      block["frame"] = clamp_frame(block["frame"], block["type"], format) if block["frame"]
    end
    slide
  end

  def normalize_slide(raw)
    raw = (raw || {}).to_h.deep_stringify_keys
    contract = Layouts::Registry.find(raw["layoutId"])
    blocks = Array(raw["blocks"]).map { |block| normalize_block(block, contract) }
    orphans = Array(raw["orphans"]).map { |block| normalize_block(block, nil) }

    # Bloco sem lugar no layout não some: fica guardado em `orphans` e volta
    # se o layout mudar de novo. Dois blocos no mesmo slot: o primeiro fica.
    placed = []
    blocks.each do |block|
      if contract&.slot(block["slot"]) && placed.none? { |other| other["slot"] == block["slot"] }
        placed << block
      else
        orphans << block
      end
    end

    # Slot obrigatório sem bloco: primeiro um órfão do mesmo slot volta; senão
    # entra vazio — espaço reservado na tela, nunca texto inventado.
    contract&.required_slots&.each do |slot|
      next if placed.any? { |block| block["slot"] == slot.id }

      orphan = orphans.find { |block| block["slot"] == slot.id && block["type"] == slot.type }
      placed << (orphan ? orphans.delete(orphan) : normalize_block({ "slot" => slot.id }, contract))
    end
    placed.sort_by! { |block| contract.slots.keys.index(block["slot"]) || 99 } if contract

    slide = {
      "id" => uuid?(raw["id"]) ? raw["id"] : SecureRandom.uuid,
      "layoutId" => raw["layoutId"].to_s,
      "background" => normalize_background(raw["background"], contract),
      "blocks" => placed,
      "orphans" => orphans
    }
    # Só aparece quando foi escolhido: a lâmina de sempre continua igual (e
    # com o mesmo checksum de render).
    slide["scrim"] = raw["scrim"] if SCRIM_LEVELS.include?(raw["scrim"])
    slide
  end

  def normalize_background(raw, contract)
    raw = (raw || {}).to_h.deep_stringify_keys
    default = contract&.default_background || { "type" => "color", "colorToken" => "primary" }
    type = raw["type"].to_s
    type = default["type"] unless contract.nil? ? %w[image color].include?(type) : contract.background_options.include?(type)

    background = { "type" => type }
    if type == "color"
      token = raw["colorToken"].to_s
      background["colorToken"] = COLOR_TOKENS.key?(token) ? token : (default["colorToken"] || "primary")
    else
      background["assetId"] = uuid?(raw["assetId"]) ? raw["assetId"] : nil
      background["focalPoint"] = focal_point(raw["focalPoint"])
    end
    if raw["overlay"].is_a?(Hash)
      background["overlay"] = { "token" => "scrim-dark", "opacity" => raw["overlay"]["opacity"].to_f.clamp(0.0, 0.8).round(2) }
    end
    background
  end

  def normalize_block(raw, contract)
    raw = (raw || {}).to_h.deep_stringify_keys
    slot = contract&.slot(raw["slot"])
    type = slot&.type || raw["type"].to_s.presence || "text"
    block = { "id" => uuid?(raw["id"]) ? raw["id"] : SecureRandom.uuid, "slot" => raw["slot"].to_s, "type" => type }

    case type
    when "text"
      role = raw["styleRole"].to_s
      block["content"] = raw["content"].to_s.gsub("\r\n", "\n").strip
      block["styleRole"] = STYLE_ROLES.key?(role) ? role : (slot&.role_default || "body")
      block["sizeStep"] = raw["sizeStep"].to_i.clamp(SIZE_STEPS.min, SIZE_STEPS.max)
      align = raw["align"].to_s
      options = contract&.align_options.presence || %w[left center]
      block["align"] = options.include?(align) ? align : (contract&.default_align || "left")
      block["visible"] = raw.key?("visible") ? raw["visible"] != false : true
    when "image"
      block["assetId"] = uuid?(raw["assetId"]) ? raw["assetId"] : nil
      block["focalPoint"] = focal_point(raw["focalPoint"])
      block["fit"] = IMAGE_FITS.include?(raw["fit"].to_s) ? raw["fit"].to_s : "cover"
      block["visible"] = raw.key?("visible") ? raw["visible"] != false : true
    when "logo"
      block["variant"] = LOGO_VARIANTS.include?(raw["variant"].to_s) ? raw["variant"].to_s : "light"
      block["visible"] = raw.key?("visible") ? raw["visible"] != false : slot&.default_visible != false
    end
    frame = normalize_frame(raw["frame"], type)
    block["frame"] = frame if frame
    block
  end

  # O lugar livre de um bloco arrastado. Texto não guarda altura (o texto
  # decide, até o `max_lines` do slot); foto e logo guardam. Só a forma —
  # quem prende na área segura é o editor, e o `clamp_frame` na gravação.
  def normalize_frame(raw, type)
    return nil unless raw.is_a?(Hash)

    raw = raw.stringify_keys
    return nil unless %w[x y w].all? { |key| raw[key].is_a?(Numeric) || raw[key].to_s.match?(/\A-?\d+(\.\d+)?\z/) }

    frame = { "x" => raw["x"].to_f.round(1), "y" => raw["y"].to_f.round(1), "w" => [ raw["w"].to_f, FRAME_MIN ].max.round(1) }
    frame["h"] = [ raw["h"].to_f, FRAME_MIN ].max.round(1) if type != "text" && raw["h"].present?
    frame
  end

  # Prende o `frame` no canvas (foto) ou na área segura (texto, logo).
  def clamp_frame(frame, type, format)
    canvas = FORMATS.fetch(format)
    safe = type == "image" ? { "top" => 0, "right" => 0, "bottom" => 0, "left" => 0 } : SAFE.fetch(format)
    w = frame["w"].clamp(FRAME_MIN, canvas["width"] - safe["left"] - safe["right"])
    h = frame["h"]&.clamp(FRAME_MIN, canvas["height"] - safe["top"] - safe["bottom"])
    out = {
      "x" => frame["x"].clamp(safe["left"], canvas["width"] - safe["right"] - w).round(1),
      "y" => frame["y"].clamp(safe["top"], canvas["height"] - safe["bottom"] - (h || FRAME_MIN)).round(1),
      "w" => w.round(1)
    }
    out["h"] = h.round(1) if h
    out
  end

  def focal_point(raw)
    raw = raw.is_a?(Hash) ? raw.stringify_keys : {}
    x = raw.key?("x") ? raw["x"].to_f : 0.5
    y = raw.key?("y") ? raw["y"].to_f : 0.5
    { "x" => x.clamp(0.0, 1.0).round(4), "y" => y.clamp(0.0, 1.0).round(4) }
  end

  def normalize_caption(raw)
    raw = raw.is_a?(Hash) ? raw.stringify_keys : {}
    hashtags = Array(raw["hashtags"]).filter_map { |tag|
      word = tag.to_s.strip.delete_prefix("#").gsub(/\s+/, "")
      "##{word}" if word.present?
    }.uniq
    { "text" => raw["text"].to_s.strip, "hashtags" => hashtags }
  end

  def normalize_meta(raw)
    raw = raw.is_a?(Hash) ? raw.stringify_keys : {}
    {
      "requestText" => raw["requestText"].to_s.presence,
      "generatedAt" => raw["generatedAt"].presence,
      "generatedBy" => %w[agent user migration].include?(raw["generatedBy"]) ? raw["generatedBy"] : "user",
      # O esquema do ritmo do carrossel (`Rhythm`) com que a peça nasceu.
      "scheme" => Rhythm::SCHEMES.key?(raw["scheme"]) ? raw["scheme"] : nil
    }.compact
  end
end
