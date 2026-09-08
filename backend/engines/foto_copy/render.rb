module Engines
  class FotoCopy < Base
    def render(canvas, values)
      s = surface(values)
      paint_background(canvas, s)

      band_h = story? ? 620 : 480
      photo_h = canvas.height - band_h
      photo = values["photo"] && tokens.asset_image(values["photo"])

      unless canvas.image(photo, x: 0, y: 0, width: canvas.width, height: photo_h, fit: :cover)
        # Espaço reservado: um bloco quieto com um disco no acento, para a
        # pessoa ver onde a foto entra.
        canvas.rect(0, 0, canvas.width, photo_h, s.ink, opacity: 0.08)
        canvas.circle(canvas.width / 2, photo_h / 2, 96, s.accent, opacity: 0.5)
      end

      width = content_width(canvas)
      price = ref_value("price")
      y = photo_h + (story? ? 72 : 56)
      copy_width = price ? width - 320 : width
      canvas.text(values["copy"], x: margin, y: y, width: copy_width, style: "title", color: s.ink, max_lines: 2)
      canvas.text(price, x: margin + width - 300, y: y, width: 300, style: "number", color: s.accent, align: :right, max_lines: 1) if price

      draw_footer(canvas, s)
    end
  end
end
