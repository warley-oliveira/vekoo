# Pasta: a única organização de carrosséis da etapa 1. `color` guarda a cor
# crua em oklch (a mesma que a interface pinta), não um token da ferramenta.
class CreateFolders < ActiveRecord::Migration[8.1]
  def change
    create_table :folders, id: :uuid do |t|
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.string :name, null: false
      t.string :color, null: false

      t.timestamps
    end

    add_index :folders, [ :organization_id, :name ]
  end
end
