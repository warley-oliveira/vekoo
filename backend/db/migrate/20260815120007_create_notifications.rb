# Aviso do produto. Guarda só a **chave** de tradução (`notifications.<key>`):
# o texto é interface e pertence à tela, não ao banco.
class CreateNotifications < ActiveRecord::Migration[8.1]
  def change
    create_table :notifications, id: :uuid do |t|
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.string :key, null: false
      t.boolean :read, null: false, default: false
      t.datetime :notified_at, null: false

      t.timestamps
    end

    add_index :notifications, [ :organization_id, :notified_at ]
  end
end
