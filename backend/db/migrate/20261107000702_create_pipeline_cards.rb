# Cards e o que pendura direto neles: etiquetas, observadores, anexos e atividade.
#
# Quem aponta para `accounts` usa `nullify` ou `cascade`: `DELETE /users/:id` apaga a pessoa de
# verdade (be-access), e uma chave estrangeira sem regra faria essa rota responder 500.
class CreatePipelineCards < ActiveRecord::Migration[8.1]
  def change
    create_table :pipeline_labels, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.string :name, null: false
      t.string :color, null: false, default: "#607D8B"

      t.timestamps
    end

    # Sem ligar para a caixa: é a mesma regra da validação, agora também sob corrida.
    add_index :pipeline_labels, "organization_id, lower(name)", unique: true,
      name: "index_pipeline_labels_on_organization_and_lower_name"

    create_table :pipeline_cards, id: :uuid do |t|
      # Repetida de propósito (a origem chegava nela pelo quadro): o isolamento entre organizações
      # e a busca por conversa partem daqui, sem dois joins.
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.references :stage, null: false, type: :uuid, index: false,
        foreign_key: { to_table: :pipeline_stages, on_delete: :cascade }

      t.string :title, null: false
      t.text :description
      t.jsonb :description_json
      t.string :audience_id
      t.string :status
      t.string :priority
      t.datetime :due_date
      t.integer :position
      t.uuid :assigned_to_id
      t.uuid :created_by_id
      t.jsonb :custom_field_values, null: false, default: {}
      t.string :tags, array: true, null: false, default: []
      t.string :color_label
      # A conversa está no Mongo: texto, sem chave estrangeira.
      t.string :chat_id
      t.boolean :archived, null: false, default: false
      t.datetime :completed_at

      t.decimal :deal_value, precision: 12, scale: 2
      t.integer :deal_probability
      t.string :company_name
      t.string :contact_email
      t.string :contact_phone
      t.datetime :won_at
      t.datetime :lost_at
      t.string :lost_reason
      t.date :expected_close_date

      # Na origem, `column_entered_at`, que podia ficar nulo. Aqui todo card nasce com a data.
      t.datetime :stage_entered_at, null: false, default: -> { "CURRENT_TIMESTAMP" }
      # O que impede as varreduras recorrentes de repetir o mesmo aviso a cada execução.
      t.datetime :sla_notified_at
      t.datetime :due_notified_at

      t.timestamps
    end

    add_foreign_key :pipeline_cards, :accounts, column: :assigned_to_id, on_delete: :nullify
    add_foreign_key :pipeline_cards, :accounts, column: :created_by_id, on_delete: :nullify

    add_index :pipeline_cards, %i[stage_id archived position]
    add_index :pipeline_cards, %i[organization_id chat_id], where: "chat_id IS NOT NULL"
    add_index :pipeline_cards, :assigned_to_id
    add_index :pipeline_cards, :created_by_id
    add_index :pipeline_cards, :tags, using: :gin
    add_index :pipeline_cards, %i[stage_id won_at], where: "won_at IS NOT NULL"
    # A varredura de prazo só olha o que ainda pode vencer.
    add_index :pipeline_cards, :due_date, where: "due_date IS NOT NULL AND archived = false AND completed_at IS NULL",
      name: "index_pipeline_cards_on_open_due_date"

    create_table :pipeline_card_labels, id: :uuid do |t|
      t.references :card, null: false, type: :uuid, index: false,
        foreign_key: { to_table: :pipeline_cards, on_delete: :cascade }
      t.references :label, null: false, type: :uuid, index: true,
        foreign_key: { to_table: :pipeline_labels, on_delete: :cascade }

      t.timestamps
    end

    add_index :pipeline_card_labels, %i[card_id label_id], unique: true

    create_table :pipeline_card_watchers, id: :uuid do |t|
      t.references :card, null: false, type: :uuid, index: false,
        foreign_key: { to_table: :pipeline_cards, on_delete: :cascade }
      t.references :account, null: false, type: :uuid, index: true, foreign_key: { on_delete: :cascade }

      t.timestamps
    end

    add_index :pipeline_card_watchers, %i[card_id account_id], unique: true

    create_table :pipeline_card_attachments, id: :uuid do |t|
      t.references :card, null: false, type: :uuid, index: true,
        foreign_key: { to_table: :pipeline_cards, on_delete: :cascade }
      t.references :account, type: :uuid, index: true, foreign_key: { on_delete: :nullify }
      t.string :file_name

      t.timestamps
    end

    # Uma linha por evento: é o histórico do card, e não cabe numa coluna que cresce.
    create_table :pipeline_card_activities, id: :uuid do |t|
      t.references :card, null: false, type: :uuid, index: false,
        foreign_key: { to_table: :pipeline_cards, on_delete: :cascade }
      t.references :account, type: :uuid, index: true, foreign_key: { on_delete: :nullify }
      t.string :action, null: false
      t.jsonb :details, null: false, default: {}
      t.datetime :created_at, null: false
    end

    add_index :pipeline_card_activities, %i[card_id created_at], order: { created_at: :desc }
    add_index :pipeline_card_activities, %i[card_id action created_at], order: { created_at: :desc },
      name: "index_pipeline_card_activities_on_card_action_time"
  end
end
