class CreateProductItemCategories < ActiveRecord::Migration[8.1]
  def change
    create_table :product_item_categories, id: :uuid do |t|
      t.references :product_item, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.references :product_category, null: false, type: :uuid, foreign_key: { on_delete: :cascade }

      t.timestamps
    end

    add_index :product_item_categories, %i[product_item_id product_category_id],
      unique: true, name: "index_product_item_categories_uniqueness"
  end
end
