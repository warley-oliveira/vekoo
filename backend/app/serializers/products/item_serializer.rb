module Products
  class ItemSerializer < ApplicationSerializer
    # `full` é o da tela de edição: leva a descrição, que pode ser enorme, e as categorias.
    def self.one(item, full: false)
      payload = {
        id: item.id,
        title: item.title,
        summary: item.summary,
        externalId: item.external_id,
        url: item.url,
        active: item.active,
        tags: item.tags,
        customFields: item.custom_fields,
        images: ImageSerializer.many(item.images),
        createdAt: epoch_ms(item.created_at),
        updatedAt: epoch_ms(item.updated_at)
      }
      return payload unless full

      payload.merge(
        description: item.description,
        categories: item.categories.map { |category| { id: category.id, name: category.name, path: category.path } }
      )
    end

    def self.many(items)
      records = items.to_a
      # Sem isto, cada linha da grade faria uma consulta de imagens e duas de anexo.
      ActiveRecord::Associations::Preloader.new(
        records: records, associations: { images: { file_attachment: :blob } }
      ).call

      records.map { |item| one(item) }
    end
  end
end
