module Engines
  class DestaqueItem < Base
    def render(canvas, values)
      s = surface(values)
      paint_background(canvas, s)
      width = content_width(canvas)

      y = safe_top
      photo = values["photo"] && tokens.asset_image(values["photo"])
      if photo
        size = story? ? 560 : 420
        canvas.image(photo, x: margin, y: y, width: width, height: size, fit: :cover)
        y += size + 48
      end

      _, h = canvas.text(values["name"], x: margin, y: y, width: width, style: "title", color: s.ink, max_lines: 2)
      y += h + 24
      _, h = canvas.text(values["composition"], x: margin, y: y, width: width, style: "lede", color: s.ink, opacity: 0.85, max_lines: 4)
      y += h + 40
      _, h = canvas.text(values["price"], x: margin, y: y, width: width, style: "number", color: s.accent, max_lines: 1)
      y += h + 16
      muted_text(canvas, values["note"], s, x: margin, y: y, width: width, style: "footer", max_lines: 1) if values["note"]

      draw_footer(canvas, s)
    end
  end
end
