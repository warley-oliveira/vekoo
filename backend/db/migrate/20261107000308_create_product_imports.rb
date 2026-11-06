class CreateProductImports < ActiveRecord::Migration[8.1]
  def change
    create_table :product_imports, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.references :account, type: :uuid, foreign_key: { on_delete: :nullify }
      t.string :status, null: false, default: "pending"
      t.string :filename
      t.string :delimiter
      # Mapeamento coluna do CSV -> campo do catálogo, definido pela pessoa.
      t.jsonb :mapping, null: false, default: {}
      t.jsonb :options, null: false, default: {}
      t.integer :total_rows, null: false, default: 0
      t.integer :processed_rows, null: false, default: 0
      t.integer :created_count, null: false, default: 0
      t.integer :updated_count, null: false, default: 0
      t.integer :error_count, null: false, default: 0
      # Amostra com TETO (Products::Import::MAX_ERROR_SAMPLES). Acumulador jsonb sem
      # teto tem custo de reescrita quadrático. O histórico completo vai em
      # product_import_rows.
      t.jsonb :error_sample, null: false, default: []
      t.datetime :started_at
      t.datetime :completed_at

      t.timestamps
    end

    add_index :product_imports, %i[organization_id created_at]
    add_index :product_imports, %i[organization_id status]
    # A varredura de importação interrompida procura por status, sem organização.
    add_index :product_imports, %i[status updated_at]
  end
end
