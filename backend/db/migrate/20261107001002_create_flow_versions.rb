# Cada publicação congela uma versão, e as execuções em andamento continuam na que começaram.
# `published_at` nulo é o rascunho que o editor grava.
class CreateFlowVersions < ActiveRecord::Migration[8.1]
  def change
    create_table :flow_versions, id: :uuid do |t|
      t.references :flow, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.integer :version_number, null: false
      t.jsonb :definition, null: false, default: { nodes: [], edges: [], viewport: {} }
      t.datetime :published_at
      t.uuid :created_by_account_id

      t.timestamps
    end

    add_index :flow_versions, %i[flow_id version_number], unique: true

    # Referência circular com `flows`: apagar a versão publicada não pode apagar o fluxo.
    add_foreign_key :flows, :flow_versions, column: :published_version_id, on_delete: :nullify
  end
end
