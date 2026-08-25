# Sessão por token. O token cru só existe uma vez, na resposta de entrar ou
# criar conta; o banco guarda apenas o resumo (SHA-256), então vazar a tabela
# não entrega sessão de ninguém.
class CreateSessions < ActiveRecord::Migration[8.1]
  def change
    create_table :sessions, id: :uuid do |t|
      t.references :account, null: false, foreign_key: true, type: :uuid
      t.string :token_digest, null: false
      t.string :user_agent
      t.string :ip_address
      t.datetime :expires_at, null: false
      t.datetime :last_used_at

      t.timestamps
    end

    add_index :sessions, :token_digest, unique: true
  end
end
