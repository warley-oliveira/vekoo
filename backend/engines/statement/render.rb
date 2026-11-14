module Engines
  class Statement < Base
    def render(canvas, values)
      s = surface(values)
      paint_background(canvas, s)

      width = content_width(canvas)
      price = values["price"]
      # O lockup mede o preço de verdade: um valor longo quebra em duas
      # linhas mesmo depois de encolher, e a frase precisa saber disso.
      _, price_h = price ? canvas.measure(price, width: width, style: "number", max_lines: 2) : [ 0, 0 ]
      lockup_h = price ? price_h + canvas.line_height(style: "kicker") + 24 : 0

      # A frase ocupa o centro do espaço livre; o lockup, quando existe, fica
      # ancorado acima do rodapé.
      top = safe_top
      bottom = content_bottom(canvas) - canvas.line_height(style: "footer") - 40 - lockup_h
      size = canvas.style_size("title") * (story? ? 1.15 : 1.0)
      _, h = canvas.measure(values["phrase"], width: width, style: "title", size: size, max_lines: 4)
      y = top + [ (bottom - top - h) / 2, 0 ].max
      canvas.text(values["phrase"], x: margin, y: y, width: width, style: "title", size: size,
        color: s.ink, max_lines: 4)

      if price
        y = bottom + 24
        y += draw_kicker(canvas, s, values["label"], y: y) + 8
        canvas.text(price, x: margin, y: y, width: width, style: "number", color: s.accent, max_lines: 2)
      end

      draw_footer(canvas, s)
    end
  end
end
