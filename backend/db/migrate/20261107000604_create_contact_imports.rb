class CreateContactImports < ActiveRecord::Migration[8.1]
  def change
    create_table :contact_imports, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.references :account, type: :uuid, foreign_key: { on_delete: :nullify }
      # O conector vive no Mongo: é texto, sem chave estrangeira.
      t.string :connector_id, null: false
      t.string :file_name
      t.integer :total_contacts, null: false
      t.integer :imported_contacts_count, null: false, default: 0
      t.integer :errors_count, null: false, default: 0
      t.boolean :include_country_code, null: false, default: false
      t.integer :batch_index
      t.integer :total_batches
      t.string :status, null: false, default: "pending"
      t.datetime :started_at
      t.datetime :completed_at

      t.timestamps
    end

    add_index :contact_imports, %i[organization_id created_at]
    add_index :contact_imports, %i[status updated_at]
  end
end
