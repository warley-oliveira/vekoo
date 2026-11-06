class CreateProductCategories < ActiveRecord::Migration[8.1]
  def change
    create_table :product_categories, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.uuid :parent_id
      t.string :name, null: false
      t.string :slug, null: false
      # Materialized path — 'moda/feminino/vestidos'. Filtrar por ramo é
      # `path LIKE 'moda/%'`, que usa o índice text_pattern_ops abaixo.
      t.string :path, null: false
      t.integer :position, null: false, default: 0
      t.integer :items_count, null: false, default: 0

      t.timestamps
    end

    add_foreign_key :product_categories, :product_categories, column: :parent_id, on_delete: :cascade

    # Um índice só para as duas funções: unicidade do caminho na organização e
    # prefixo de ramo escopado por ela (a origem tinha um global, sem o tenant).
    add_index :product_categories, %i[organization_id path],
      unique: true, opclass: { path: :text_pattern_ops }
    add_index :product_categories, %i[organization_id parent_id position],
      name: "index_product_categories_on_organization_parent_position"
    add_index :product_categories, :parent_id
  end
end
