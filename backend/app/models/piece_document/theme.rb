module PieceDocument
  # O Brandcore **publicado** traduzido para quem desenha: o que cada token de
  # cor vale, a tinta legível sobre cada um, a fonte/peso/caixa de cada papel
  # de texto e a logo. Decidido uma vez, aqui, e entregue igual aos dois
  # renderizadores — o React (preview e export) e o libvips. É o que impede
  # um de achar que `primary` é uma cor e o outro, outra.
  #
  # Nada daqui vai para o documento: o documento guarda token e papel; o tema
  # é recalculado na hora do render, a partir da versão publicada.
  module Theme
    # Altura de linha e espaçamento entre letras (em em) por papel. É desenho
    # da Vekoo, não da marca: a marca escolhe fonte, peso e caixa.
    ROLE_METRICS = {
      "display" => { "lineHeight" => 1.04, "tracking" => -0.01 },
      "headline" => { "lineHeight" => 1.12, "tracking" => 0 },
      "body" => { "lineHeight" => 1.38, "tracking" => 0 },
      "label" => { "lineHeight" => 1.2, "tracking" => 0.08 },
      "caption" => { "lineHeight" => 1.3, "tracking" => 0.02 }
    }.freeze

    # Sem cor da marca para um papel, um neutro — nunca uma cor que pareça
    # escolha dela.
    FALLBACK = { "textOnDark" => "#FAF8F5", "textOnLight" => "#14121A", "accent" => "#14121A" }.freeze
    TOKEN_FALLBACK = { "primary" => "#14121A", "secondary" => "#3A3644", "accent" => "#14121A", "surface" => "#F4F1EA" }.freeze

    module_function

    def call(brand_core)
      tokens = Engines::Tokens.new(brand_core)
      colors = tokens.colors
      on_dark = role_hex(colors, "textOnDark")
      on_light = role_hex(colors, "textOnLight")
      accent = role_hex(colors, "accent")

      token_colors = COLOR_TOKENS.keys.to_h { |token|
        [ token, PieceDocument.resolve_token(colors, token)&.fetch("hex") || TOKEN_FALLBACK[token] ]
      }
      on_colors = token_colors.transform_values { |hex| legible(hex, on_dark, on_light) }

      {
        "brandCoreVersion" => tokens.version,
        "colors" => token_colors,
        "ink" => on_colors,
        # O rótulo (papel `label`) usa o acento quando ele lê sobre o fundo;
        # senão, a tinta comum.
        "accentInk" => token_colors.to_h { |token, hex| [ token, BrandCore::Colors.contrast(accent, hex) >= 3.0 ? accent : on_colors[token] ] },
        "accent" => accent,
        # Texto sobre foto: a tinta clara, com o escurecimento por baixo.
        "imageInk" => on_dark,
        "roles" => roles(tokens),
        "fonts" => fonts(tokens, brand_core),
        "logo" => logo(brand_core, tokens.document)
      }
    end

    # As fotos que o documento usa, com URL e tamanho — o render precisa da
    # proporção antes de a imagem carregar para não pular.
    def assets(brand_core, document)
      ids = Array(document["slides"]).flat_map { |slide|
        [ slide.dig("background", "assetId") ] + Array(slide["blocks"]).map { |block| block["assetId"] }
      }.compact.uniq
      brand_core.assets.where(id: ids).where.not(kind: "font").to_h { |asset|
        [ asset.id, display(asset) ]
      }
    end

    def role_hex(colors, role)
      colors.find { |c| c["role"] == role }&.fetch("hex") || FALLBACK[role]
    end

    # A tinta que mais contrasta com o fundo, entre as duas da marca.
    def legible(background, on_dark, on_light)
      BrandCore::Colors.contrast(on_dark, background) >= BrandCore::Colors.contrast(on_light, background) ? on_dark : on_light
    end

    def roles(tokens)
      STYLE_ROLES.to_h { |role, style_key|
        style = tokens.style(style_key) || {}
        font_role = style["font"].presence || (role == "display" || role == "headline" ? "display" : "utility")
        font = tokens.font(font_role)
        [ role, {
          "font" => font_role,
          "family" => font.family.presence || "sans-serif",
          "weight" => style["weight"].to_i.nonzero? || 400,
          "transform" => style["transform"] == "uppercase" ? "uppercase" : "none"
        }.merge(ROLE_METRICS.fetch(role)) ]
      }
    end

    # As fontes que o front carrega antes de desenhar: as do catálogo pelo
    # nome (o front busca no Google Fonts), as enviadas pela URL do arquivo.
    def fonts(tokens, brand_core)
      BrandCore::Schema::FONT_ROLES.filter_map { |font_role|
        raw = tokens.document["typography"][font_role]
        next if raw["family"].blank?

        url = nil
        if raw["source"] == "file" && raw["assetId"].present?
          asset = brand_core.assets.find_by(id: raw["assetId"], kind: "font")
          url = asset && ApplicationSerializer.blob_url(asset.file)
        end
        { "role" => font_role, "family" => raw["family"], "source" => raw["source"], "url" => url, "weights" => Array(raw["weights"]) }
      }
    end

    # A logo principal da versão publicada, nas duas variantes.
    def logo(brand_core, published_document)
      primary = brand_core.primary_logo(published_document)
      %w[light dark].to_h { |variant|
        asset = primary&.variant(variant)
        [ variant, asset && { "assetId" => asset.id }.merge(display(asset)) ]
      }
    end

    # SVG vai pelo PNG dele: servido como download, o SVG não carrega em <img>.
    def display(asset)
      width, height = asset.display_size
      { "url" => ApplicationSerializer.blob_url(asset.display_file), "width" => width, "height" => height }
    end
  end
end
