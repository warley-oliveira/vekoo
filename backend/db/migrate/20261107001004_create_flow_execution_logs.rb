# Uma linha por bloco executado, em vez de acumular em `flow_executions.context`: jsonb não tem
# append parcial, e cada bloco regravaria o histórico inteiro. A retenção apaga por execução
# (`Flows::PruneExecutionsJob`), e o resto vai em cascata.
class CreateFlowExecutionLogs < ActiveRecord::Migration[8.1]
  def change
    create_table :flow_execution_logs, id: :uuid do |t|
      t.references :flow_execution, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.string :node_id, null: false
      t.string :node_type, null: false
      t.jsonb :input, null: false, default: {}
      t.jsonb :output, null: false, default: {}
      t.integer :duration_ms
      t.string :status, null: false, default: "success"
      t.text :error_message
      t.datetime :executed_at, null: false

      t.timestamps
    end

    add_index :flow_execution_logs, %i[flow_execution_id executed_at]
    # Retenção de execução longa: fluxo em espera há meses ainda tem log antigo para sair.
    add_index :flow_execution_logs, :executed_at
  end
end
