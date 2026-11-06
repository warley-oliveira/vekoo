class CreateProductImages < ActiveRecord::Migration[8.1]
  def change
    create_table :product_images, id: :uuid do |t|
      t.references :product_item, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      # O arquivo hospedado mora no Active Storage (`file`). Esta coluna guarda de
      # onde a imagem veio quando ela nasceu fora: URL da importação, espelhada ou não.
      t.string :source_url
      t.string :alt
      t.integer :position, null: false, default: 0

      t.timestamps
    end

    add_index :product_images, %i[product_item_id position]
  end
end
