module Engines
  class PromoBox < Base
    def render(canvas, values)
      s = surface(values)
      paint_background(canvas, s)
      width = content_width(canvas)

      y = safe_top
      _, h = canvas.text(values["title"], x: margin, y: y, width: width, style: "title", color: s.ink, max_lines: 2)
      y += h + 32
      if values["support"]
        _, h = canvas.text(values["support"], x: margin, y: y, width: width, style: "body", color: s.ink, opacity: 0.85, max_lines: 3)
        y += h + 48
      end

      # A caixa: fundo levemente contrastado, filete no acento à esquerda.
      pad = 48
      inner = width - pad * 2 - 12
      tag_h = canvas.line_height(style: "kicker")
      _, desc_h = canvas.measure(values["description"], width: inner, style: "lede", max_lines: 2)
      price_h = canvas.line_height(style: "number")
      box_h = pad * 2 + tag_h + 16 + desc_h + 24 + price_h
      box_y = [ y, content_bottom(canvas) - canvas.line_height(style: "footer") - 40 - box_h ].min

      canvas.rect(margin, box_y, width, box_h, s.ink, opacity: 0.08, radius: 24)
      canvas.rect(margin, box_y, 12, box_h, s.accent, radius: 6)

      x = margin + 12 + pad
      cy = box_y + pad
      canvas.text(values["tag"], x: x, y: cy, width: inner, style: "kicker", color: s.accent, max_lines: 1)
      cy += tag_h + 16
      _, h = canvas.text(values["description"], x: x, y: cy, width: inner, style: "lede", color: s.ink, max_lines: 2)
      cy += h + 24
      canvas.text(values["price"], x: x, y: cy, width: inner, style: "number", color: s.ink, max_lines: 1)

      draw_footer(canvas, s)
    end
  end
end
