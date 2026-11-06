class CreateProductFieldDefinitions < ActiveRecord::Migration[8.1]
  def change
    create_table :product_field_definitions, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.string :name, null: false
      # name.parameterize.underscore — imutável depois de criada, porque é a chave
      # dentro do jsonb custom_fields de todo item.
      t.string :key, null: false
      t.string :description
      t.string :value_type, null: false
      t.string :option_values, array: true, null: false, default: []
      t.string :default_value
      t.boolean :required, null: false, default: false
      # Entra no texto indexado (busca lexical + embedding) e vira filtro na busca.
      t.boolean :searchable, null: false, default: true
      t.integer :position, null: false, default: 0

      t.timestamps
    end

    add_index :product_field_definitions, %i[organization_id key],
      unique: true, name: "index_product_field_definitions_on_organization_and_key"
    add_index :product_field_definitions, %i[organization_id position],
      name: "index_product_field_definitions_on_organization_and_position"
  end
end
