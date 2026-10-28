# A peça vira documento (`PieceDocument`) e cada alteração salva vira uma
# versão — o snapshot inteiro, não um diff: barato, e faz histórico e
# "restaurar" triviais. A peça aponta para a versão atual.
#
# `engine_id` deixa de ser obrigatório: só a peça legada (feita por motor e
# sem equivalente em layout) continua com ele e sem documento.
class CreatePieceVersions < ActiveRecord::Migration[8.1]
  def change
    create_table :piece_versions, id: :uuid do |t|
      t.references :piece, type: :uuid, null: false, foreign_key: true
      t.references :account, type: :uuid, foreign_key: { on_delete: :nullify }
      t.uuid :base_version_id
      t.jsonb :document, null: false, default: {}
      t.string :source, null: false
      t.string :summary
      t.datetime :created_at, null: false
    end
    add_index :piece_versions, %i[piece_id created_at]

    add_column :pieces, :current_version_id, :uuid
    add_index :pieces, :current_version_id
    change_column_null :pieces, :engine_id, true
  end
end
