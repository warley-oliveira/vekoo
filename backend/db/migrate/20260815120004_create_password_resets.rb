# Pedido de nova senha. Mesmo esquema do token de sessão: o banco guarda só o
# resumo, e o pedido morre depois de usado ou vencido.
class CreatePasswordResets < ActiveRecord::Migration[8.1]
  def change
    create_table :password_resets, id: :uuid do |t|
      t.references :account, null: false, foreign_key: true, type: :uuid
      t.string :token_digest, null: false
      t.datetime :expires_at, null: false
      t.datetime :used_at

      t.timestamps
    end

    add_index :password_resets, :token_digest, unique: true
  end
end
