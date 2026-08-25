# O carrossel é um documento de blocos: `theme` guarda as cores da obra e
# `cards` a lista de cards com seus blocos (o mesmo formato de lib/doc.ts no
# front). Guardar como jsonb mantém o documento inteiro em um lugar só — o
# editor salva o documento, não linha a linha.
#
# Lixeira é lógica: `trashed_at` preenchido = na lixeira.
class CreateCarousels < ActiveRecord::Migration[8.1]
  def change
    create_table :carousels, id: :uuid do |t|
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.references :folder, foreign_key: { on_delete: :nullify }, type: :uuid
      t.string :title, null: false
      t.string :format, null: false, default: "4:5"
      t.text :caption
      t.boolean :favorite, null: false, default: false
      t.jsonb :theme, null: false, default: {}
      t.jsonb :cards, null: false, default: []
      t.datetime :edited_at, null: false
      t.datetime :trashed_at

      t.timestamps
    end

    add_index :carousels, [ :organization_id, :trashed_at, :edited_at ]
    add_index :carousels, [ :organization_id, :favorite ]
  end
end
