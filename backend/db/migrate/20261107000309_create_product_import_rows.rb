class CreateProductImportRows < ActiveRecord::Migration[8.1]
  def change
    create_table :product_import_rows, id: :uuid do |t|
      t.references :product_import, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.integer :line_number, null: false
      t.string :error_message, null: false
      t.jsonb :raw, null: false, default: {}

      t.timestamps
    end

    add_index :product_import_rows, %i[product_import_id line_number]
  end
end
