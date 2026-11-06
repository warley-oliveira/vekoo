class CreateChatViews < ActiveRecord::Migration[8.1]
  def change
    create_table :chat_views, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      # Quem criou. Sai junto com a pessoa: visão pessoal sem dona não aparece para ninguém.
      t.references :account, null: false, type: :uuid, foreign_key: { on_delete: :cascade }
      t.string :name, null: false
      # As condições de filtro, como a tela as montou.
      t.jsonb :payload, null: false, default: []
      t.boolean :personal, null: false, default: false

      t.timestamps
    end

    add_index :chat_views, %i[organization_id personal]
  end
end
