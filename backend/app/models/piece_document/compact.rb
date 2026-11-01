module PieceDocument
  # O caminho inverso do `Build`: o documento na forma compacta que o agente
  # escreve (layout + conteúdo por slot). É como a peça volta ao contexto do
  # modelo — no histórico da conversa, no "ajustar" e no "mais variações" —
  # sem ids nem defaults que ele não precisa ler.
  module Compact
    module_function

    # Carrossel volta como o agente o escreve: o esquema na peça e o destaque
    # marcado, sem fundo por lâmina — a lâmina do miolo com fundo diferente
    # do resto é a de destaque.
    def call(document, title: nil)
      slides = Array(document["slides"])
      carousel = document["format"] == "carousel"
      highlighted = carousel ? highlight_positions(slides) : []
      {
        "format" => document["format"],
        "scheme" => carousel ? document.dig("meta", "scheme") : nil,
        "title" => title,
        "slides" => slides.each_with_index.map { |slide, index|
          slide_for(slide, carousel: carousel, highlight: highlighted.include?(index))
        },
        "caption" => document["caption"]
      }.compact
    end

    def slide_for(slide, carousel: false, highlight: false)
      text = Array(slide["blocks"]).find { |block| block["type"] == "text" }
      {
        "layout" => slide["layoutId"],
        "background" => carousel ? nil : background_for(slide["background"] || {}),
        "highlight" => highlight || nil,
        "align" => text&.dig("align"),
        "content" => Array(slide["blocks"]).to_h { |block|
          value =
            case block["type"]
            when "text" then block["content"]
            when "image" then block["assetId"]
            when "logo" then block["visible"]
            end
          [ block["slot"], value ]
        }
      }.compact
    end

    def background_for(background)
      background["type"] == "image" ? { "assetId" => background["assetId"] } : { "colorToken" => background["colorToken"] }
    end

    def highlight_positions(slides)
      middle = (1...(slides.length - 1)).to_a
      tokens = middle.to_h { |index| [ index, slides[index].dig("background", "colorToken") ] }
      body = tokens.values.tally.max_by { |_token, count| count }&.first
      tokens.select { |_index, token| token != body }.keys
    end
  end
end
