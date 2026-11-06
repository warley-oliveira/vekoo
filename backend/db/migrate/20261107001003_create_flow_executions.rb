class CreateFlowExecutions < ActiveRecord::Migration[8.1]
  ACTIVE_STATUSES = "status IN ('pending', 'running', 'waiting', 'waiting_for_message')".freeze

  def change
    create_table :flow_executions, id: :uuid do |t|
      t.references :flow, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.references :flow_version, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      # Sem chave estrangeira no caminho do escopo: é a organização que evita o join com `flows`.
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      # A conversa e o contato moram no Mongo.
      t.string :chat_id
      t.string :contact_id
      t.string :current_node_id
      t.string :status, null: false, default: "pending"
      t.jsonb :context, null: false, default: {}
      t.boolean :playground, null: false, default: false
      t.datetime :started_at
      t.datetime :completed_at
      t.text :error_message

      # Quem está rodando a execução: duas mensagens da mesma conversa disputam esta linha, e só
      # quem grava o próprio token executa o bloco.
      t.string :run_token
      t.datetime :locked_at
      # A espera por tempo (`wait`): só o job com este token retoma.
      t.string :resume_token
      t.datetime :resume_at
      # Evita começar duas vezes pelo mesmo evento, quando o job é entregue de novo.
      t.string :idempotency_key

      t.timestamps
    end

    add_index :flow_executions, %i[organization_id chat_id status]
    add_index :flow_executions, %i[flow_id playground created_at]
    add_index :flow_executions, %i[status updated_at]
    add_index :flow_executions, :idempotency_key, unique: true, where: "idempotency_key IS NOT NULL"

    # No máximo uma execução viva do mesmo fluxo por conversa. É o banco que garante, porque a
    # corrida acontece entre processos.
    add_index :flow_executions, %i[flow_id chat_id],
              unique: true,
              where: "playground = false AND chat_id IS NOT NULL AND #{ACTIVE_STATUSES}",
              name: "index_flow_executions_one_active_per_chat"
  end
end
