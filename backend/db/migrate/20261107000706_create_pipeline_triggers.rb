# Gatilhos do quadro e o registro de cada execução.
class CreatePipelineTriggers < ActiveRecord::Migration[8.1]
  def change
    create_table :pipeline_triggers, id: :uuid do |t|
      t.references :board, null: false, type: :uuid, index: false,
        foreign_key: { to_table: :pipeline_boards, on_delete: :cascade }
      # Gatilho da etapa morre com ela: sem o cascade, apagar a etapa viraria 500, e com `nullify`
      # ele passaria a valer para o quadro inteiro.
      t.references :stage, type: :uuid, index: true,
        foreign_key: { to_table: :pipeline_stages, on_delete: :cascade }
      t.string :name, null: false
      t.string :event_type, null: false
      t.jsonb :conditions, null: false, default: {}
      t.jsonb :actions, null: false, default: []
      t.boolean :active, null: false, default: true
      t.integer :last_round_robin_index, null: false, default: 0

      t.timestamps
    end

    add_index :pipeline_triggers, %i[board_id event_type]
    add_index :pipeline_triggers, %i[event_type active]

    # Sem teto em coluna: uma linha por execução, e o que passa da retenção sai por
    # `Pipelines::PurgeTriggerExecutionsJob`.
    create_table :pipeline_trigger_executions, id: :uuid do |t|
      t.references :pipeline_trigger, null: false, type: :uuid, index: false, foreign_key: { on_delete: :cascade }
      t.references :card, null: false, type: :uuid, index: true,
        foreign_key: { to_table: :pipeline_cards, on_delete: :cascade }
      t.string :status, null: false, default: "success"
      t.jsonb :executed_actions, null: false, default: []
      t.text :error_message
      t.datetime :executed_at, null: false, default: -> { "CURRENT_TIMESTAMP" }

      t.timestamps
    end

    add_index :pipeline_trigger_executions, %i[pipeline_trigger_id executed_at]
    add_index :pipeline_trigger_executions, :executed_at
  end
end
