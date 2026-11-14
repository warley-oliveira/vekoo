module Engines
  class ProgramaEvento < Base
    def render(canvas, values)
      s = surface(values)
      paint_background(canvas, s)
      width = content_width(canvas)

      y = safe_top
      _, h = canvas.text(values["title"], x: margin, y: y, width: width, style: "title", color: s.ink, max_lines: 2)
      y += h + 56

      time_w = 210
      row_gap = story? ? 30 : 22
      item_h = canvas.line_height(style: "item")
      values["schedule"].each do |row|
        time, happening = row.split("|", 2).map(&:strip)
        happening ||= ""
        canvas.text(time, x: margin, y: y, width: time_w, style: "item", color: s.accent, max_lines: 1)
        _, h = canvas.text(happening, x: margin + time_w + 24, y: y, width: width - time_w - 24, style: "item", color: s.ink, max_lines: 2)
        y += [ h, item_h ].max + row_gap
        break if y > content_bottom(canvas) - canvas.line_height(style: "footer") * 2 - 60
      end

      if values["partner"]
        py = content_bottom(canvas) - canvas.line_height(style: "footer") * 2 - 12
        muted_text(canvas, values["partner"], s, x: margin, y: py, width: width, style: "footer", max_lines: 1)
      end

      draw_footer(canvas, s)
    end
  end
end
