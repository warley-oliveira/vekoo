module References
  # Leva o acervo da curadoria de um ambiente para outro (dev → produção): os
  # cards de referência com análise, vetor, miniatura, `requires` e métricas,
  # e as fotos das marcas de teste já descritas. Nada é analisado, vetorizado
  # ou descrito de novo — o que custou dinheiro no dev chega pronto.
  #
  # Um JSON só, com os binários em base64: atravessa o ssh pela entrada padrão
  # direto para o `docker exec` do container, sem arquivo no servidor.
  #
  # As marcas de teste não viajam: nascem no destino do mesmo YAML
  # (`Eval::Brands`); aqui vão só as fotos, pela chave da marca. Quem curou o
  # card no destino é a conta que importa (os ids de conta não existem lá).
  module Transfer
    VERSION = 1
    # A conta que curou não existe no outro banco.
    SKIP = %w[curated_by_id].freeze

    module_function

    def export(cards:, photos: true)
      {
        "version" => VERSION,
        "exportedAt" => Time.current.iso8601,
        "cards" => cards.includes(thumbnail_attachment: :blob).map { |card| card_payload(card) },
        "photos" => photos ? photo_payloads : []
      }
    end

    # Idempotente: card que já existe (mesmo id) e foto que a marca já tem
    # (mesmo arquivo) ficam como estão.
    def import(payload, account:, log: ->(_line) { })
      raise ArgumentError, "versão #{payload['version'].inspect} do arquivo não é a #{VERSION}" unless payload["version"] == VERSION

      counts = Hash.new(0)
      Array(payload["cards"]).each do |raw|
        next counts[:cardsKept] += 1 if ReferenceCard.exists?(id: raw.dig("attributes", "id"))

        import_card(raw, account)
        counts[:cards] += 1
      end
      import_photos(Array(payload["photos"]), account, counts, log)
      counts
    end

    def card_payload(card)
      attributes = card.attributes.except(*SKIP)
      attributes["embedding"] = card.embedding&.to_a
      { "attributes" => attributes, "thumbnail" => blob_payload(card.thumbnail) }
    end

    def photo_payloads
      Eval::Brands.all.flat_map { |key, brand|
        brand.assets.where(kind: "photo", generated: false).order(:created_at).map { |asset|
          {
            "brand" => key, "filename" => asset.filename, "contentType" => asset.content_type,
            "description" => asset.description, "shows" => asset.shows,
            "describedAt" => asset.described_at&.iso8601, "descriptionCostMicroUsd" => asset.description_cost_micro_usd,
            "data" => Base64.strict_encode64(asset.file.download)
          }
        }
      }
    end

    def blob_payload(attachment)
      return nil unless attachment.attached?

      { "filename" => attachment.filename.to_s, "contentType" => attachment.content_type, "data" => Base64.strict_encode64(attachment.download) }
    end

    def import_card(raw, account)
      card = ReferenceCard.new(raw["attributes"].merge("curated_by_id" => account.id))
      card.save!
      thumbnail = raw["thumbnail"]
      return unless thumbnail

      card.thumbnail.attach(io: StringIO.new(Base64.strict_decode64(thumbnail["data"])), filename: thumbnail["filename"], content_type: thumbnail["contentType"])
    end

    # As fotos entram já descritas: a descrição vai junto na criação, então o
    # job da descrição que o envio enfileira não chama o modelo.
    def import_photos(photos, account, counts, log)
      return if photos.empty?

      brands = Eval::Brands.all
      photos.each do |raw|
        brand = brands[raw["brand"]]
        unless brand
          log.call("foto #{raw['filename']}: marca '#{raw['brand']}' não existe — rode references:eval:brands PHOTOS=0")
          next counts[:photosSkipped] += 1
        end
        next counts[:photosKept] += 1 if brand.assets.exists?(kind: "photo", filename: raw["filename"])

        data = Base64.strict_decode64(raw["data"])
        asset = brand.assets.new(
          organization: brand.organization, account: account, kind: "photo", generated: false,
          filename: raw["filename"], content_type: raw["contentType"], byte_size: data.bytesize,
          description: raw["description"], shows: Array(raw["shows"]), described_at: raw["describedAt"],
          description_cost_micro_usd: raw["descriptionCostMicroUsd"].to_i
        )
        asset.file.attach(io: StringIO.new(data), filename: raw["filename"], content_type: raw["contentType"])
        asset.save!
        AnalyzeBrandAsset.call(asset, StringIO.new(data))
        counts[:photos] += 1
      end
    end
  end
end
