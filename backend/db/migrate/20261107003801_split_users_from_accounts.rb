# Separa a pessoa do vínculo dela com a organização.
#
#   users     a pessoa e o login: e-mail único, senha, nome, telefone, idioma, foto, sessões,
#             pedidos de nova senha e dispositivos de push. `master` é o suporte do Vekoo.
#   accounts  o vínculo User × Organization: papel, grupo, departamentos, revogação. O nome fica
#             de propósito: todo `account_id` gravado no Postgres e no Mongo continua valendo.
#
# Em produção cada conta tinha a sua organização: cada uma vira um User **com o mesmo id**, e o
# vínculo aponta para ele. Assim sessões, pedidos de senha, dispositivos e a foto mudam de dono só
# trocando o nome da coluna, sem ninguém precisar entrar de novo.
#
# `accounts.number` é a sequência que o hashid da URL codifica (`/a/<hashid>/...`). O inteiro
# nunca sai pela API.
#
# Reversível enquanto cada pessoa tiver um vínculo só: com dois, a volta não teria onde pôr o
# segundo com o mesmo e-mail, e recusa em vez de perder um deles.
class SplitUsersFromAccounts < ActiveRecord::Migration[8.1]
  IDENTITY = %w[email password_digest name phone locale].freeze

  def up
    create_table :users, id: :uuid do |t|
      t.string :email, null: false
      t.string :password_digest, null: false
      t.string :name, null: false
      t.string :phone
      t.string :locale
      t.boolean :master, null: false, default: false
      t.timestamps
      t.index :email, unique: true
    end

    add_reference :accounts, :user, type: :uuid, foreign_key: true, index: false
    add_column :accounts, :support, :boolean, null: false, default: false
    add_column :accounts, :number, :bigserial, null: false
    add_index :accounts, :number, unique: true

    execute <<~SQL.squish
      INSERT INTO users (id, email, password_digest, name, phone, locale, created_at, updated_at)
      SELECT id, email, password_digest, name, phone, locale, created_at, updated_at FROM accounts
    SQL
    execute "UPDATE accounts SET user_id = id"
    change_column_null :accounts, :user_id, false
    add_index :accounts, %i[user_id organization_id], unique: true

    move_owner :sessions, from: :account_id, to: :user_id, references: :users
    move_owner :password_resets, from: :account_id, to: :user_id, references: :users
    move_owner :push_devices, from: :account_id, to: :user_id, references: :users, on_delete: :cascade
    remove_reference :push_devices, :organization, type: :uuid, index: true, foreign_key: { on_delete: :cascade }

    execute <<~SQL.squish
      UPDATE active_storage_attachments SET record_type = 'User'
      WHERE record_type = 'Account' AND name = 'avatar'
    SQL

    remove_index :accounts, :email
    IDENTITY.each { |column| remove_column :accounts, column }

    create_table :support_accesses, id: :uuid do |t|
      t.references :user, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.references :organization, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.references :account, type: :uuid, foreign_key: { on_delete: :nullify }
      t.string :ip_address
      t.string :user_agent
      t.datetime :created_at, null: false
      t.index :created_at
    end
  end

  def down
    shared = select_value("SELECT COUNT(*) FROM (SELECT user_id FROM accounts GROUP BY user_id HAVING COUNT(*) > 1) t").to_i
    raise ActiveRecord::IrreversibleMigration, "#{shared} pessoa(s) com mais de uma organização" if shared.positive?

    drop_table :support_accesses
    execute "DELETE FROM accounts WHERE support"

    add_column :accounts, :email, :string
    add_column :accounts, :password_digest, :string
    add_column :accounts, :name, :string
    add_column :accounts, :phone, :string
    add_column :accounts, :locale, :string
    execute <<~SQL.squish
      UPDATE accounts SET email = users.email, password_digest = users.password_digest, name = users.name,
             phone = users.phone, locale = users.locale
      FROM users WHERE users.id = accounts.user_id
    SQL
    %i[email password_digest name].each { |column| change_column_null :accounts, column, false }
    add_index :accounts, :email, unique: true

    execute <<~SQL.squish
      UPDATE active_storage_attachments SET record_type = 'Account', record_id = accounts.id
      FROM accounts WHERE active_storage_attachments.record_type = 'User'
        AND active_storage_attachments.name = 'avatar' AND accounts.user_id = active_storage_attachments.record_id
    SQL

    add_reference :push_devices, :organization, type: :uuid, index: true, foreign_key: { on_delete: :cascade }
    move_owner :push_devices, from: :user_id, to: :account_id, references: :accounts, on_delete: :cascade, via_user: true
    execute "DELETE FROM push_devices WHERE account_id IS NULL"
    execute <<~SQL.squish
      UPDATE push_devices SET organization_id = accounts.organization_id FROM accounts WHERE accounts.id = push_devices.account_id
    SQL
    change_column_null :push_devices, :organization_id, false
    move_owner :password_resets, from: :user_id, to: :account_id, references: :accounts, via_user: true
    move_owner :sessions, from: :user_id, to: :account_id, references: :accounts, via_user: true

    remove_index :accounts, %i[user_id organization_id]
    remove_index :accounts, :number
    remove_column :accounts, :number
    remove_column :accounts, :support
    remove_reference :accounts, :user, foreign_key: true
    drop_table :users
  end

  private

  # Troca a coluna dona de uma tabela. Na ida o id é o mesmo (o User nasceu com o id da conta);
  # na volta, `via_user` acha a conta do User.
  def move_owner(table, from:, to:, references:, on_delete: nil, via_user: false)
    add_reference table, to.to_s.delete_suffix("_id").to_sym, type: :uuid, index: true
    if via_user
      execute "UPDATE #{table} SET #{to} = accounts.id FROM accounts WHERE accounts.user_id = #{table}.#{from}"
    else
      execute "UPDATE #{table} SET #{to} = #{from}"
    end
    execute "DELETE FROM #{table} WHERE #{to} IS NULL"
    change_column_null table, to, false
    add_foreign_key table, references, column: to, **({ on_delete: on_delete }.compact)
    remove_reference table, from.to_s.delete_suffix("_id").to_sym, type: :uuid, index: true, foreign_key: true
  end
end
