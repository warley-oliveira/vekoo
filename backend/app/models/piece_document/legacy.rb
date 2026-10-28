module PieceDocument
  # A peça feita por um motor (`engine_id` + `values`) como documento. Só os
  # motores com equivalente direto na biblioteca de layouts convertem; os
  # outros (contagem, tabela, programa de evento) devolvem nil e a peça segue
  # como legado, só leitura, com as imagens que já tem.
  #
  # Nada se perde: campo sem slot no layout novo vai para `orphans`.
  module Legacy
    # motor → [layout, { campo do motor => slot }]
    MAP = {
      "statement" => [ "text-only-solid", { "phrase" => "title", "label" => "badge", "price" => "body" } ],
      "preco_heroi" => [ "text-only-solid", { "price" => "title", "label" => "badge", "subline" => "body" } ],
      "foto_copy" => [ "hero-image-title-bottom", { "photo" => "image", "copy" => "title", "price" => "badge" } ],
      "promo_box" => [ "product-card", { "title" => "title", "tag" => "badge", "description" => "body", "price" => "price", "support" => "support" } ],
      "destaque_item" => [ "product-card", { "photo" => "image", "name" => "title", "composition" => "body", "price" => "price", "note" => "badge" } ]
    }.freeze

    FORMATS = { "post" => "feed_portrait", "story" => "story" }.freeze

    # Papel da cor de fundo escolhida no motor → token do documento.
    ROLE_TOKENS = {
      "darkBackground" => "primary", "lightBackground" => "surface",
      "accent" => "accent", "campaign" => "secondary", "muted" => "secondary"
    }.freeze

    module_function

    def convertible?(engine_id) = MAP.key?(engine_id.to_s)

    def call(piece)
      layout_id, fields = MAP[piece.engine_id]
      return nil unless layout_id

      values = piece.values || {}
      blocks = fields.filter_map { |field, slot|
        value = values[field]
        next if value.blank?

        if field == "photo"
          { "slot" => slot, "type" => "image", "assetId" => value.to_s }
        else
          { "slot" => slot, "type" => "text", "content" => value.to_s }
        end
      }
      blocks << { "slot" => "logo", "type" => "logo", "visible" => true }

      document = PieceDocument.normalize(
        {
          "format" => FORMATS.fetch(piece.format, "feed_portrait"),
          "slides" => [ { "layoutId" => layout_id, "background" => background(piece), "blocks" => blocks } ],
          "caption" => {},
          "meta" => { "generatedBy" => "migration", "generatedAt" => piece.created_at&.iso8601 }
        },
        piece_id: piece.id,
        brand_id: piece.brand_core_id,
        brand_core_version_id: piece.brand_core_version_id
      )
      # A logo vai no fundo certo: a versão para fundo claro só no "surface".
      document["slides"].each do |slide|
        logo = slide["blocks"].find { |block| block["type"] == "logo" }
        logo["variant"] = Build.logo_variant_for(slide["background"]) if logo
      end
      document
    end

    def background(piece)
      color_id = piece.values["background"]
      role = piece.brand_core.full_document.dig("palette", "colors")&.find { |color| color["id"] == color_id }&.dig("role")
      token = ROLE_TOKENS[role]
      token ? { "type" => "color", "colorToken" => token } : {}
    end
  end
end
