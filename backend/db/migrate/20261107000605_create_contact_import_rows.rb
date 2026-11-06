class CreateContactImportRows < ActiveRecord::Migration[8.1]
  def change
    create_table :contact_import_rows, id: :uuid do |t|
      t.references :contact_import, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.string :name, null: false
      t.string :phone, null: false
      t.jsonb :additional_data, null: false, default: {}
      t.string :status, null: false, default: "pending"
      t.text :error_message
      t.datetime :processed_at

      t.timestamps
    end

    add_index :contact_import_rows, %i[contact_import_id status]
  end
end
