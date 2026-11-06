# Campos personalizados do quadro (na origem, `kanban_custom_field_definitions`). Os valores moram
# em `pipeline_cards.custom_field_values`, chaveados por `key`.
class CreatePipelineCustomFields < ActiveRecord::Migration[8.1]
  def change
    create_table :pipeline_custom_fields, id: :uuid do |t|
      t.references :board, null: false, type: :uuid, index: false,
        foreign_key: { to_table: :pipeline_boards, on_delete: :cascade }
      t.references :stage, type: :uuid, index: true,
        foreign_key: { to_table: :pipeline_stages, on_delete: :cascade }
      t.string :name, null: false
      # Estável ao renomear: é por ela que os valores dos cards ficam guardados.
      t.string :key, null: false
      t.string :field_type, null: false
      t.string :scope, null: false, default: "board"
      t.integer :position
      t.boolean :required, null: false, default: false
      t.boolean :required_to_leave_stage, null: false, default: false
      t.jsonb :options
      t.string :default_value

      t.timestamps
    end

    # Único: dois campos com a mesma chave gravariam um por cima do outro no mesmo card.
    add_index :pipeline_custom_fields, %i[board_id key], unique: true
    add_index :pipeline_custom_fields, %i[board_id position]
  end
end
