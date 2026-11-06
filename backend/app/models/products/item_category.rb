module Products
  class ItemCategory < ApplicationRecord
    belongs_to :item, class_name: "Products::Item", foreign_key: :product_item_id, inverse_of: :item_categories
    belongs_to :category, class_name: "Products::Category", foreign_key: :product_category_id,
      counter_cache: :items_count, inverse_of: :item_categories

    validates :product_category_id, uniqueness: { scope: :product_item_id }
  end
end
