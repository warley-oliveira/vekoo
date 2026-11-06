module Products
  class CategorySerializer < ApplicationSerializer
    def self.one(category)
      {
        id: category.id,
        name: category.name,
        slug: category.slug,
        path: category.path,
        parentId: category.parent_id,
        position: category.position,
        itemsCount: category.items_count,
        depth: category.depth,
        createdAt: epoch_ms(category.created_at),
        updatedAt: epoch_ms(category.updated_at)
      }
    end
  end
end
