# O PNG de uma lâmina, derivado de uma versão do documento por um dos dois
# renderizadores. Nunca muda e nunca é apagado com a edição: a versão nova
# ganha renders novos, e o `checksum` (documento da lâmina + tema + arquivos +
# código dos layouts + renderizador) deixa reaproveitar o PNG quando nada mudou.
class CreatePieceRenders < ActiveRecord::Migration[8.1]
  def change
    create_table :piece_renders, id: :uuid do |t|
      t.references :piece_version, type: :uuid, null: false, foreign_key: true
      t.string :slide_id, null: false
      t.integer :position, null: false
      t.string :renderer, null: false
      t.string :checksum, null: false
      t.integer :width, null: false
      t.integer :height, null: false
      t.datetime :rendered_at, null: false
      t.timestamps
    end
    add_index :piece_renders, %i[piece_version_id renderer position], unique: true
    add_index :piece_renders, %i[checksum renderer]
  end
end
