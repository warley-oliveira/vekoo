module Engines
  class Tabela < Base
    def render(canvas, values)
      s = surface(values)
      paint_background(canvas, s)
      width = content_width(canvas)

      y = safe_top
      _, h = canvas.text(values["title"], x: margin, y: y, width: width, style: "title", color: s.ink, max_lines: 2)
      y += h + 48

      rows = values["rows"].map { |row| row.split("|").map(&:strip) }
      value_w = 260
      text_w = width - value_w - 32
      item_h = canvas.line_height(style: "item")
      body_h = canvas.line_height(style: "footer")

      rows.each_with_index do |(label, description, value), index|
        row_top = y
        canvas.text(label, x: margin, y: y, width: text_w, style: "item", color: s.ink, max_lines: 1)
        y += item_h
        if description.present?
          muted_text(canvas, description, s, x: margin, y: y, width: text_w, style: "footer", max_lines: 1)
          y += body_h
        end
        canvas.text(value, x: margin + text_w + 32, y: row_top, width: value_w, style: "item", color: s.accent, align: :right, max_lines: 1) if value.present?
        y += 22
        canvas.rect(margin, y, width, 2, s.ink, opacity: 0.15) if index < rows.length - 1
        y += 22
        break if y > content_bottom(canvas) - canvas.line_height(style: "footer") - item_h - 60
      end

      draw_footer(canvas, s)
    end
  end
end
