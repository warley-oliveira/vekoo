module PieceDocument
  # O caminho inverso do `Build`: o documento na forma compacta que o agente
  # escreve (layout + conteúdo por slot). É como a peça volta ao contexto do
  # modelo — no histórico da conversa, no "ajustar" e no "mais variações" —
  # sem ids nem defaults que ele não precisa ler.
  module Compact
    module_function

    def call(document, title: nil)
      {
        "format" => document["format"],
        "title" => title,
        "slides" => Array(document["slides"]).map { |slide| slide_for(slide) },
        "caption" => document["caption"]
      }.compact
    end

    def slide_for(slide)
      background = slide["background"] || {}
      text = Array(slide["blocks"]).find { |block| block["type"] == "text" }
      {
        "layout" => slide["layoutId"],
        "background" => background["type"] == "image" ? { "assetId" => background["assetId"] } : { "colorToken" => background["colorToken"] },
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
  end
end
