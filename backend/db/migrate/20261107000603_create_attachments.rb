class CreateAttachments < ActiveRecord::Migration[8.1]
  def change
    create_table :attachments, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.string :name, null: false
      t.string :description
      t.string :file_name
      # Privado: arquivo enviado por dentro de uma conversa, fora da galeria de anexos.
      t.boolean :private, null: false, default: false

      t.timestamps
    end

    add_index :attachments, %i[organization_id private created_at]
  end
end
