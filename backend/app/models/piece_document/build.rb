module PieceDocument
  # Monta o documento canônico a partir da forma **compacta** que o agente
  # devolve — por lâmina, o layout e o conteúdo de cada slot:
  #
  #   { "format": "carousel", "caption": { "text": "…", "hashtags": [] },
  #     "slides": [ { "layout": "carousel-cover", "align": "left",
  #                   "background": { "colorToken": "primary" } | { "assetId": "…" },
  #                   "content": { "title": "…", "image": "<assetId>", "logo": true } } ] }
  #
  # Carrossel: `"scheme": "light" | "dark"` na peça e `"highlight": true` na
  # lâmina de destaque, em vez de `background`.
  #
  # O modelo decide conteúdo e composição; ids, papéis de texto, degraus e
  # defaults do layout são do servidor — menos token, nenhum id inventado.
  module Build
    module_function

    # No carrossel, a cor de cada lâmina vem do ritmo da marca (`Rhythm`) e o
    # tamanho da letra do miolo, do texto que mais ocupa (`Fit`); o fundo que
    # o agente mandar ali não conta. `measurer` entra pronto nas specs.
    def from_agent(raw, brand_core:, request_text: nil, measurer: nil)
      raw = (raw || {}).to_h.deep_stringify_keys
      raw_slides = Array(raw["slides"])
      meta = { "requestText" => request_text, "generatedAt" => Time.current.iso8601, "generatedBy" => "agent" }
      carousel = raw["format"] == "carousel"
      tokens = []
      if carousel
        scheme, roles = Rhythm.scheme_for(raw["scheme"], Engines::Tokens.new(brand_core).colors)
        if roles
          tokens = Rhythm.tokens(raw_slides, roles)
          meta["scheme"] = scheme
        end
      end
      slides = raw_slides.each_with_index.map { |slide, index| slide_from_agent(slide, token: tokens[index]) }
      Fit.carousel!(slides, measurer: measurer || PieceRenderers::Libvips.new(brand_core)) if carousel

      PieceDocument.normalize(
        {
          "format" => raw["format"],
          "slides" => slides,
          "caption" => raw["caption"],
          "meta" => meta
        },
        brand_id: brand_core.id,
        brand_core_version_id: brand_core.versions.find_by(number: brand_core.current_version)&.id
      )
    end

    def slide_from_agent(raw, token: nil)
      raw = (raw || {}).to_h.stringify_keys
      layout_id = raw["layout"].presence || raw["layoutId"]
      contract = Layouts::Registry.find(layout_id)
      content = (raw["content"] || {}).to_h.stringify_keys
      background = token ? { "type" => "color", "colorToken" => token } : background_from_agent(raw["background"], contract)

      blocks = (contract&.slots&.values || []).filter_map { |slot|
        value = content[slot.id]
        case slot.type
        when "text"
          next if value.to_s.strip.empty? && !slot.required?

          { "slot" => slot.id, "content" => value.to_s, "align" => raw["align"] }
        when "image"
          next if value.blank? && !slot.required?

          { "slot" => slot.id, "assetId" => value.to_s.presence }
        when "logo"
          visible = value.nil? ? slot.default_visible != false : value != false
          { "slot" => slot.id, "visible" => visible, "variant" => logo_variant_for(background) }
        end
      }

      { "layoutId" => layout_id.to_s, "background" => background, "blocks" => blocks }
    end

    def background_from_agent(raw, contract)
      raw = (raw || {}).to_h.stringify_keys
      if raw["assetId"].present? && contract&.background_options&.include?("image")
        { "type" => "image", "assetId" => raw["assetId"] }
      elsif raw["colorToken"].present?
        { "type" => "color", "colorToken" => raw["colorToken"] }
      else
        contract&.default_background || {}
      end
    end

    # A variante da logo pensada para o fundo: a "dark" é a versão para fundo
    # escuro. Foto leva escurecimento, então também pede a de fundo escuro.
    def logo_variant_for(background)
      background["type"] == "color" && background["colorToken"] == "surface" ? "light" : "dark"
    end
  end
end
