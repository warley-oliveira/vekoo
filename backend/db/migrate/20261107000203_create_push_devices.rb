# Assinatura Web Push de uma pessoa em um dispositivo (navegador).
class CreatePushDevices < ActiveRecord::Migration[8.1]
  def change
    create_table :push_devices, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }
      t.references :account, null: false, type: :uuid, foreign_key: { on_delete: :cascade }
      t.text :endpoint, null: false
      t.text :p256dh_key, null: false
      t.text :auth_key, null: false
      t.text :user_agent
      t.timestamps

      # O endpoint identifica o navegador: entrar com outra conta nele troca o
      # dono da assinatura em vez de criar uma segunda.
      t.index :endpoint, unique: true
    end
  end
end
