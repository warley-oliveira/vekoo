# A classe-base de todo motor. `render.rb` de cada diretório define
# `Engines::<Id>` herdando daqui e implementa `render(canvas, values)` como
# função pura de composição: tokens do Brandcore + valores + formato → PNG.
#
# Os ajudantes aqui são o vocabulário comum (superfície de fundo, margens,
# rodapé com @ e logo) para os motores não repetirem geometria.
module Engines
  class Base
    Surface = Struct.new(:background, :background_role, :ink, :accent, :muted, :dark, keyword_init: true)

    attr_reader :manifest, :tokens, :values, :refs, :format

    def initialize(manifest:, tokens:, values:, refs:, format:)
      @manifest = manifest
      @tokens = tokens
      @values = values
      @refs = refs
      @format = format.to_s
    end

    # Um quadro por padrão; motores de série (contagem) devolvem vários
    # conjuntos de valores, um por imagem.
    def frames
      [ values ]
    end

    # Todas as imagens da peça, como PNG, na ordem.
    def render_all
      width, height = manifest.dimensions(format)
      frames.map do |frame_values|
        canvas = Canvas.new(width: width, height: height, tokens: tokens)
        render(canvas, frame_values)
        canvas.to_png
      end
    end

    def render(_canvas, _values)
      raise NotImplementedError, "#{self.class.name} precisa implementar render(canvas, values)"
    end

    private

    # -------------------------------------------------------------- geometria

    def story? = format == "story"
    def margin = 84
    # Nos stories a interface do Instagram cobre o topo e o pé.
    def safe_top = story? ? 230 : margin
    def safe_bottom = story? ? 300 : margin
    def content_width(canvas) = canvas.width - margin * 2
    def content_bottom(canvas) = canvas.height - safe_bottom

    # -------------------------------------------------------------- superfície

    # O fundo escolhido no campo `background` (ou o fundo escuro da marca) e
    # as cores que pertencem a ele.
    def surface(frame_values, field: "background")
      chosen = frame_values[field] && tokens.color_by_id(frame_values[field])
      role = chosen ? chosen["role"] : "darkBackground"
      background = chosen ? chosen["hex"] : tokens.color(role)
      Surface.new(
        background: background,
        background_role: role,
        ink: tokens.text_for(role),
        accent: tokens.color("accent"),
        muted: tokens.color("muted"),
        dark: role == "darkBackground"
      )
    end

    def paint_background(canvas, surface)
      canvas.fill(surface.background)
    end

    # Texto de apoio: a cor "apoio" da marca ou a tinta com opacidade.
    def muted_text(canvas, str, surface, **options)
      if surface.muted
        canvas.text(str, color: surface.muted, **options)
      else
        canvas.text(str, color: surface.ink, opacity: 0.62, **options)
      end
    end

    # @ da marca no pé, à esquerda; logo (versão para o fundo) à direita.
    def draw_footer(canvas, surface)
      y = content_bottom(canvas) - canvas.line_height(style: "footer")
      handle = tokens.identity["instagram"].presence
      muted_text(canvas, "@#{handle}", surface, x: margin, y: y, width: content_width(canvas) / 2, style: "footer") if handle

      logo = tokens.logo(surface.dark ? "dark" : "light")
      logo_h = 56
      canvas.image(logo, x: canvas.width - margin - 200, y: y - (logo_h - canvas.line_height(style: "footer")) / 2, width: 200, height: logo_h) if logo
    end

    def draw_kicker(canvas, surface, str, y:, align: :left)
      return 0 if str.blank?

      _, h = canvas.text(str, x: margin, y: y, width: content_width(canvas), style: "kicker", color: surface.accent, align: align, max_lines: 1)
      h
    end

    def ref_value(field)
      refs[field]&.value
    end

    def ref_label(field)
      refs[field]&.label
    end
  end
end
