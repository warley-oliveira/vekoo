module Engines
  class Contagem < Base
    # Em série, um quadro por número, de N até 1. No modo frase (ou sem
    # número), um quadro só.
    def frames
      number = values["number"].to_i
      return [ values ] unless values["series"] == "sequence" && values["mode"] == "number" && number.positive?

      number.downto(1).map { |n| values.merge("number" => n) }
    end

    def render(canvas, values)
      s = surface(values)
      paint_background(canvas, s)
      width = content_width(canvas)

      hero = values["mode"] == "phrase" ? values["phrase"].to_s : values["number"].to_i.to_s
      hero_size = canvas.style_size("number") * (values["mode"] == "phrase" ? 1.6 : (story? ? 4.2 : 3.6))
      _, hero_h = canvas.measure(hero, width: width, style: "number", size: hero_size, max_lines: 2)
      _, sub_h = canvas.measure(values["subline"], width: width, style: "lede", max_lines: 2)
      block = hero_h + (sub_h.positive? ? 24 + sub_h : 0)

      top = safe_top
      bottom = content_bottom(canvas) - canvas.line_height(style: "footer") - 40
      y = top + [ (bottom - top - block) / 2, 0 ].max
      _, h = canvas.text(hero, x: margin, y: y, width: width, style: "number", size: hero_size,
        color: s.accent, align: :center, max_lines: 2)
      y += h + 24
      canvas.text(values["subline"], x: margin, y: y, width: width, style: "lede", color: s.ink, align: :center, max_lines: 2) if values["subline"]

      draw_footer(canvas, s)
    end
  end
end
