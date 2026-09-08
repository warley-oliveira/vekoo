module Engines
  class PrecoHeroi < Base
    def render(canvas, values)
      s = surface(values)
      paint_background(canvas, s)
      width = content_width(canvas)

      price_size = canvas.style_size("number") * (story? ? 2.6 : 2.2)
      kicker_h = canvas.line_height(style: "kicker")
      _, price_h = canvas.measure(ref_value("price"), width: width, style: "number", size: price_size, max_lines: 1)
      _, sub_h = canvas.measure(values["subline"], width: width, style: "lede", max_lines: 2)
      block = kicker_h + 28 + price_h + (sub_h.positive? ? 28 + sub_h : 0)

      top = safe_top
      bottom = content_bottom(canvas) - canvas.line_height(style: "footer") - 40
      y = top + [ (bottom - top - block) / 2, 0 ].max

      y += draw_kicker(canvas, s, values["label"], y: y, align: :center) + 28
      _, h = canvas.text(ref_value("price"), x: margin, y: y, width: width, style: "number", size: price_size,
        color: s.accent, align: :center, max_lines: 1)
      y += h + 28
      canvas.text(values["subline"], x: margin, y: y, width: width, style: "lede", color: s.ink, align: :center, max_lines: 2) if values["subline"]

      draw_footer(canvas, s)
    end
  end
end
