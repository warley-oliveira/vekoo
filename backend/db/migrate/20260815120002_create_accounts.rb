# A conta da pessoa. O e-mail é único no produto inteiro (uma pessoa, uma
# organização — convite para várias entra depois).
class CreateAccounts < ActiveRecord::Migration[8.1]
  def change
    create_table :accounts, id: :uuid do |t|
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.string :name, null: false
      t.string :email, null: false
      t.string :password_digest, null: false
      t.string :role, null: false, default: "member"

      t.timestamps
    end

    add_index :accounts, :email, unique: true
  end
end
