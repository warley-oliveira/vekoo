# O Brandcore **publicado** como tokens para os motores: cores por papel,
# fontes por papel, hierarquia de estilos, ativos e fatos. Os motores só
# enxergam papéis — nunca um hex ou uma família fixa no código do motor.
#
# Lê exclusivamente `published_document`: o rascunho nunca chega aqui.
module Engines
  class Tokens
    # Sem a cor do papel no Brandcore, o motor ainda compõe: neutros quietos,
    # nunca uma cor que pareça escolha da marca.
    FALLBACK = {
      "darkBackground" => "#1c1a24", "lightBackground" => "#f6f3ee",
      "textOnDark" => "#f6f3ee", "textOnLight" => "#1c1a24",
      "accent" => "#7c3aed", "campaign" => "#7c3aed", "muted" => nil
    }.freeze

    Font = Struct.new(:family, :weights, :fontfile, keyword_init: true)

    attr_reader :brand_core, :document

    def initialize(brand_core)
      raise GenerationError.new("brandNotPublished") unless brand_core.published?

      @brand_core = brand_core
      @document = BrandCore::Schema.complete(brand_core.published_document)
      @images = {}
    end

    def version
      brand_core.current_version
    end

    def version_record
      brand_core.versions.find_by(number: version)
    end

    def identity = document["identity"]
    def styles = document["styles"]["roles"]

    def colors
      @colors ||= document["palette"]["colors"].select { |c| c["hex"].to_s.match?(BrandCore::Schema::HEX) }
    end

    def color(role)
      colors.find { |c| c["role"] == role.to_s }&.fetch("hex") || FALLBACK[role.to_s]
    end

    def color_by_id(id)
      colors.find { |c| c["id"] == id.to_s }
    end

    def backgrounds
      colors.select { |c| BrandCore::Schema::BACKGROUND_ROLES.key?(c["role"]) }
    end

    def accents
      colors.select { |c| %w[accent campaign].include?(c["role"]) }
    end

    # O texto que pertence a um fundo: `textOnDark` para fundo escuro etc.
    def text_for(background_role)
      color(BrandCore::Schema::BACKGROUND_ROLES.fetch(background_role.to_s, "textOnDark"))
    end

    def style(key)
      styles.find { |s| s["key"] == key.to_s } ||
        BrandCore::Schema.default_styles.find { |s| s["key"] == key.to_s }
    end

    # A fonte do papel, **com o arquivo** sempre que der.
    #
    # Passar só o nome da família ao Pango não basta: ele resolve por
    # fontconfig, e o servidor não tem as fontes do catálogo instaladas — a
    # peça saía em DejaVu para todo mundo, independentemente da escolha da
    # marca. Fonte por arquivo vem do ativo; fonte do catálogo, do
    # `BrandFonts` (baixa uma vez e guarda em disco). Sem arquivo, cai no
    # comportamento antigo em vez de derrubar a renderização.
    def font(role)
      raw = document["typography"][role.to_s]
      family = raw["family"].presence
      weights = raw["weights"]
      Font.new(family: family, weights: weights, fontfile: font_file(raw, family, weights))
    end

    def logo(variant)
      asset = brand_core.assets.find_by(kind: "logo", variant: variant.to_s)
      asset && image_for(asset)
    end

    def asset_image(asset_id, kinds: %w[photo])
      asset = brand_core.assets.find_by(id: asset_id, kind: kinds)
      asset && image_for(asset)
    end

    private

    # Um mesmo ativo entra em várias camadas (e em vários quadros da série):
    # decodifica uma vez. Sem decoder para o formato (SVG sem librsvg), o
    # motor segue sem o ativo — não sem a peça.
    def image_for(asset)
      @images.fetch(asset.id) do
        @images[asset.id] = begin
          Vips::Image.new_from_buffer(asset.file.download, "")
        rescue StandardError => e
          Rails.logger.warn("engines: ativo #{asset.id} não decodificou (#{e.class})")
          nil
        end
      end
    end

    def font_file(raw, family, weights)
      if raw["source"] == "file" && raw["assetId"]
        asset = brand_core.assets.find_by(id: raw["assetId"], kind: "font")
        return asset && font_path(asset)
      end
      return nil unless family

      # O peso mais usado da família é o que vale a pena ter em disco: o
      # Pango sintetiza os outros a partir dele, e baixar nove arquivos por
      # marca custaria mais do que a diferença de traço.
      BrandFonts.path(family, Array(weights).min || 400)
    end

    def font_path(asset)
      @fonts ||= {}
      @fonts.fetch(asset.id) do
        file = Tempfile.new([ "brand-font", File.extname(asset.filename) ])
        file.binmode
        file.write(asset.file.download)
        file.flush
        @fonts[asset.id] = file # o Tempfile vive enquanto os tokens viverem
        file.path
      end.then { |value| value.is_a?(Tempfile) ? value.path : value }
    end
  end
end
