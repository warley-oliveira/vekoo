# O fluxo é o que automatiza o atendimento no lugar dos assistentes da origem. A definição em
# si mora em `flow_versions`; aqui ficam só os metadados que a lista precisa.
class CreateFlows < ActiveRecord::Migration[8.1]
  def change
    create_table :flows, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.string :name, null: false
      t.text :description
      t.string :status, null: false, default: "draft"
      t.string :trigger_type, null: false
      # { "connector_ids": [...] }: em quais canais o fluxo dispara. Vazio é em todos.
      t.jsonb :connector_filter, null: false, default: {}
      t.uuid :published_version_id
      t.uuid :created_by_account_id

      t.timestamps
    end

    # O disparo de uma mensagem: os publicados da organização, por gatilho.
    add_index :flows, %i[organization_id status trigger_type]
    add_index :flows, %i[organization_id updated_at]
  end
end
