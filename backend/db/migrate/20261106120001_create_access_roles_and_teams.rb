class CreateAccessRolesAndTeams < ActiveRecord::Migration[8.1]
  def change
    create_table :access_roles, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }
      t.string :name, null: false
      t.jsonb :permissions, null: false, default: {}
      t.timestamps
      t.index %i[organization_id name], unique: true
    end

    create_table :teams, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }
      t.string :name, null: false
      t.timestamps
      t.index %i[organization_id name], unique: true
    end

    create_table :team_memberships, id: :uuid do |t|
      t.references :team, null: false, type: :uuid, foreign_key: { on_delete: :cascade }
      t.references :account, null: false, type: :uuid, foreign_key: { on_delete: :cascade }
      t.timestamps
      t.index %i[team_id account_id], unique: true
    end

    change_table :accounts do |t|
      t.references :access_role, type: :uuid, foreign_key: { on_delete: :nullify }
      t.string :phone
      t.string :locale
      t.datetime :revoked_at
      t.datetime :last_seen_at
    end

    change_table :organizations do |t|
      t.jsonb :features, null: false, default: {}
      t.jsonb :settings, null: false, default: {}
      t.string :timezone, null: false, default: "America/Sao_Paulo"
    end
  end
end
