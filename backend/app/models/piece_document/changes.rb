module PieceDocument
  # O que mudou entre duas versões, em códigos — a tela escreve "título
  # alterado na lâmina 2" no idioma dela. É o rótulo do histórico do editor.
  module Changes
    module_function

    def call(before, after)
      return [ { "kind" => "created" } ] if before.nil?

      changes = []
      before_slides = Array(before["slides"]).index_by { |s| s["id"] }
      after_slides = Array(after["slides"])

      after_slides.each_with_index do |slide, index|
        old = before_slides[slide["id"]]
        next changes << { "kind" => "slideAdded", "slide" => index + 1 } unless old

        changes << { "kind" => "layout", "slide" => index + 1 } if old["layoutId"] != slide["layoutId"]
        changes << { "kind" => "background", "slide" => index + 1 } if old["background"] != slide["background"]
        old_blocks = old["blocks"].index_by { |b| b["slot"] }
        slide["blocks"].each do |block|
          previous = old_blocks[block["slot"]]
          next if previous == block

          kind =
            case block["type"]
            when "image" then "image"
            when "logo" then "logo"
            else previous && previous["content"] == block["content"] ? "style" : "text"
            end
          changes << { "kind" => kind, "slot" => block["slot"], "slide" => index + 1 }
        end
      end
      removed = before_slides.keys - after_slides.map { |s| s["id"] }
      changes << { "kind" => "slideRemoved", "count" => removed.length } if removed.any?
      if before_slides.keys & after_slides.map { |s| s["id"] } != after_slides.map { |s| s["id"] } & before_slides.keys
        changes << { "kind" => "slidesMoved" }
      end
      changes << { "kind" => "caption" } if before["caption"] != after["caption"]
      changes.uniq.first(12)
    end
  end
end
