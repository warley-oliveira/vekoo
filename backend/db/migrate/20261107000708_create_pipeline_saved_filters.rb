# Filtros salvos do quadro e os favoritos de cada pessoa.
class CreatePipelineSavedFilters < ActiveRecord::Migration[8.1]
  def change
    create_table :pipeline_saved_filters, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, index: true, foreign_key: { on_delete: :cascade }
      t.references :board, null: false, type: :uuid, index: false,
        foreign_key: { to_table: :pipeline_boards, on_delete: :cascade }
      # Pessoa apagada: o filtro compartilhado continua servindo ao time, sem dono para editar.
      t.references :account, type: :uuid, index: true, foreign_key: { on_delete: :nullify }
      t.string :name, null: false
      t.string :visibility, null: false, default: "private"
      t.jsonb :definition, null: false, default: {}

      t.timestamps
    end

    add_index :pipeline_saved_filters, %i[board_id visibility]
    add_index :pipeline_saved_filters, %i[board_id account_id]

    create_table :pipeline_saved_filter_favorites, id: :uuid do |t|
      t.references :account, null: false, type: :uuid, index: true, foreign_key: { on_delete: :cascade }
      t.references :pipeline_saved_filter, type: :uuid, index: { name: "index_pipeline_filter_favorites_on_filter" },
        foreign_key: { on_delete: :cascade }
      t.string :preset_key
      t.references :board, null: false, type: :uuid, index: true,
        foreign_key: { to_table: :pipeline_boards, on_delete: :cascade }

      t.timestamps
    end

    add_index :pipeline_saved_filter_favorites, %i[account_id board_id preset_key], unique: true,
      where: "preset_key IS NOT NULL", name: "index_pipeline_filter_favorites_on_preset"
    add_index :pipeline_saved_filter_favorites, %i[account_id pipeline_saved_filter_id], unique: true,
      where: "pipeline_saved_filter_id IS NOT NULL", name: "index_pipeline_filter_favorites_on_saved"
    add_check_constraint :pipeline_saved_filter_favorites,
      "(pipeline_saved_filter_id IS NULL) <> (preset_key IS NULL)", name: "pipeline_filter_favorite_target_xor"
  end
end
