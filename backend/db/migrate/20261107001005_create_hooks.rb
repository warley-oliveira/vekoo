# O webhook: uma URL pública (`/inbound/webhooks/:uid`) que recebe o que um sistema de fora manda e
# executa as ações cadastradas.
class CreateHooks < ActiveRecord::Migration[8.1]
  def change
    create_table :hooks, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.string :uid, null: false
      t.string :name, null: false
      t.string :slug
      t.string :status, null: false, default: "test"
      t.bigint :total_request, null: false, default: 0
      # As últimas capturas do modo teste, com teto (Hook::MAX_STORED_PAYLOADS). Essa coluna, sem
      # teto, já derrubou a plataforma na origem: ver o comentário em Hook.
      t.jsonb :received_payload, null: false, default: []

      t.boolean :signature_enabled, null: false, default: false
      t.text :signing_secret_ciphertext
      t.string :signing_secret_last_four, limit: 4
      t.datetime :signing_secret_generated_at

      t.timestamps
    end

    add_index :hooks, :uid, unique: true
    add_index :hooks, %i[organization_id created_at]

    create_table :hook_actions, id: :uuid do |t|
      t.references :hook, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.string :type, null: false
      t.jsonb :config, null: false, default: {}

      t.timestamps
    end

    add_index :hook_actions, %i[hook_id created_at]
  end
end
