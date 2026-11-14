# Duas ou três cores de marca viram a paleta inteira, com os papéis que a
# geração precisa.
#
# Ninguém que abriu uma loja sabe responder "qual é a sua cor de texto sobre
# fundo escuro" — e não deveria precisar. A pessoa aponta as cores que já usa
# (ou aceita uma proposta) e o resto se deriva: fundo escuro, fundo claro, o
# texto de cada um, o acento e o apoio. As contas são as mesmas de
# `BrandCore::Colors`; o espelho no front é `buildPalette()` em
# `lib/brand-core.ts`.
#
# A regra que manda em tudo: **contraste**. Uma paleta bonita que deixa texto
# ilegível na peça é pior do que uma paleta sem graça.
module BrandCore::PaletteBuilder
  # WCAG AA para texto grande é 3; para corpo, 4.5. A peça tem os dois, então
  # o piso é 4.5 e o alvo é 7.
  MIN_CONTRAST = 4.5
  TARGET_CONTRAST = 7.0

  NEAR_BLACK = "#12101a".freeze
  NEAR_WHITE = "#faf8f5".freeze

  module_function

  # `colors` é uma lista de `{ "hex" => "#...", "name" => "..." }` (o nome é
  # opcional). `label` traduz o papel quando a cor é derivada e não tem nome.
  def call(colors, label: ->(role) { role })
    picks = Array(colors).filter_map { |color|
      hex = normalize(color.is_a?(Hash) ? (color["hex"] || color[:hex]) : color)
      next unless hex

      { "hex" => hex, "name" => (color.is_a?(Hash) ? (color["name"] || color[:name]).to_s : "").strip }
    }.uniq { |c| c["hex"] }.first(3)

    return [] if picks.empty?

    accent = most_chromatic(picks)
    dark = dark_background(picks, accent)
    light = light_background(picks, accent)
    on_dark = readable(NEAR_WHITE, dark, accent)
    on_light = readable(NEAR_BLACK, light, accent)
    muted = muted_for(on_light, light)
    # A cor de campanha não pode ser uma que já virou fundo: seriam dois
    # papéis com o mesmo hex, e a peça acharia que está pintando duas coisas.
    campaign = second_accent(picks, [ accent["hex"], dark, light ])

    roles = [
      [ "darkBackground", dark ], [ "lightBackground", light ],
      [ "textOnDark", on_dark ], [ "textOnLight", on_light ],
      [ "accent", accent["hex"] ], [ "muted", muted ]
    ]
    roles << [ "campaign", campaign ] if campaign

    roles.map { |role, hex| color_for(role, hex, picks, label) }
  end

  # ---------------------------------------------------------------- escolhas

  # A cor "da marca" é a mais colorida — não a mais escura nem a mais clara.
  def most_chromatic(picks)
    picks.max_by { |color| chroma(color["hex"]) }
  end

  def dark_background(picks, accent)
    existing = picks.map { |c| c["hex"] }.select { |hex| BrandCore::Colors.luminance(hex) < 0.12 }
    return existing.min_by { |hex| BrandCore::Colors.luminance(hex) } if existing.any?

    # Sem cor escura na mão, escurece a cor da marca até virar fundo — a
    # matiz continua sendo a dela, e não um preto genérico.
    BrandCore::Colors.mix(accent["hex"], NEAR_BLACK, 0.86)
  end

  def light_background(picks, accent)
    existing = picks.map { |c| c["hex"] }.select { |hex| BrandCore::Colors.luminance(hex) > 0.82 }
    return existing.max_by { |hex| BrandCore::Colors.luminance(hex) } if existing.any?

    # Um branco com um sopro da cor da marca: papel, não folha de impressora.
    BrandCore::Colors.mix(NEAR_WHITE, accent["hex"], 0.05)
  end

  # O texto de um fundo: parte do neutro e vai puxando até passar do alvo de
  # contraste. Um toque da cor da marca no caminho, enquanto couber.
  def readable(base, background, accent)
    tinted = BrandCore::Colors.mix(base, accent["hex"], 0.08)
    return tinted if BrandCore::Colors.contrast(tinted, background) >= TARGET_CONTRAST
    return base if BrandCore::Colors.contrast(base, background) >= MIN_CONTRAST

    # Nem o neutro serve: vai para o extremo que o fundo pedir.
    BrandCore::Colors.luminance(background) > 0.4 ? "#000000" : "#ffffff"
  end

  # O apoio precisa de contraste de texto pequeno (3) contra o fundo claro,
  # mas tem que ser visivelmente mais fraco que o texto principal.
  def muted_for(on_light, light)
    (0.55).step(0.15, -0.1) do |amount|
      candidate = BrandCore::Colors.mix(on_light, light, amount)
      return candidate if BrandCore::Colors.contrast(candidate, light) >= 3.0
    end
    on_light
  end

  # A segunda cor colorida vira "campanha" — a cor de promoção, que a peça usa
  # quando quer gritar sem trocar a marca inteira.
  def second_accent(picks, taken)
    rest = picks.reject { |c| taken.include?(c["hex"]) }.select { |c| chroma(c["hex"]) > 0.12 }
    rest.max_by { |c| chroma(c["hex"]) }&.fetch("hex")
  end

  # ------------------------------------------------------------------ apoio

  # Reaproveita o nome que a pessoa (ou a proposta) deu, quando a cor é uma
  # das escolhidas; senão nomeia pelo papel.
  def color_for(role, hex, picks, label)
    given = picks.find { |c| c["hex"] == hex && c["name"].present? }
    {
      "id" => "cor-#{role.underscore.dasherize}",
      "name" => given ? given["name"] : label.call(role),
      "hex" => hex,
      "role" => role
    }
  end

  # Distância entre o canal mais forte e o mais fraco: "quanta cor tem aqui".
  # Serve melhor que saturação HSL para separar cinza de cor.
  def chroma(hex)
    values = BrandCore::Colors.rgb(hex)
    (values.max - values.min) / 255.0
  end

  def normalize(value)
    hex = value.to_s.strip.downcase
    hex = "##{hex}" unless hex.start_with?("#")
    hex = "##{hex[1..].chars.map { |c| c * 2 }.join}" if hex.length == 4
    hex.match?(BrandCore::Schema::HEX) ? hex : nil
  end
end
