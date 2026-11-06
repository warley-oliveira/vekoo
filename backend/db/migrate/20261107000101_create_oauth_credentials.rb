class CreateOauthCredentials < ActiveRecord::Migration[8.1]
  def change
    create_table :oauth_credentials, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.string :key_name, null: false
      t.string :endpoint, null: false
      t.string :client_id, null: false
      t.text :client_secret, null: false
      t.datetime :expires_at
      t.text :token_data

      t.timestamps
    end

    add_index :oauth_credentials, %i[organization_id key_name], unique: true
  end
end
