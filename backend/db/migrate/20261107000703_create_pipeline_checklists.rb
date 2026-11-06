# Checklist livre do card e checklist da etapa (a que trava o avanço do card).
class CreatePipelineChecklists < ActiveRecord::Migration[8.1]
  def change
    create_table :pipeline_checklists, id: :uuid do |t|
      t.references :card, null: false, type: :uuid, index: true,
        foreign_key: { to_table: :pipeline_cards, on_delete: :cascade }
      t.string :name, null: false
      t.integer :position

      t.timestamps
    end

    create_table :pipeline_checklist_items, id: :uuid do |t|
      t.references :pipeline_checklist, null: false, type: :uuid, index: true,
        foreign_key: { on_delete: :cascade }
      t.string :title, null: false
      t.boolean :completed, null: false, default: false
      t.integer :position
      t.uuid :assigned_to_id

      t.timestamps
    end

    add_foreign_key :pipeline_checklist_items, :accounts, column: :assigned_to_id, on_delete: :nullify
    add_index :pipeline_checklist_items, :assigned_to_id

    create_table :pipeline_stage_checklist_items, id: :uuid do |t|
      t.references :stage, null: false, type: :uuid, index: true,
        foreign_key: { to_table: :pipeline_stages, on_delete: :cascade }
      t.string :title, null: false
      t.integer :position
      t.boolean :required, null: false, default: true

      t.timestamps
    end

    create_table :pipeline_card_stage_checks, id: :uuid do |t|
      t.references :card, null: false, type: :uuid, index: false,
        foreign_key: { to_table: :pipeline_cards, on_delete: :cascade }
      t.references :pipeline_stage_checklist_item, null: false, type: :uuid,
        index: { name: "index_pipeline_card_stage_checks_on_item" },
        foreign_key: { on_delete: :cascade }
      t.boolean :completed, null: false, default: false
      t.datetime :completed_at
      t.uuid :completed_by_id

      t.timestamps
    end

    add_foreign_key :pipeline_card_stage_checks, :accounts, column: :completed_by_id, on_delete: :nullify
    add_index :pipeline_card_stage_checks, %i[card_id pipeline_stage_checklist_item_id], unique: true,
      name: "index_pipeline_card_stage_checks_unique"
  end
end
