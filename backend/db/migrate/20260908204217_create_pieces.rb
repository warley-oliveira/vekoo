# Uma peça: a saída de um motor sobre a versão publicada do Brandcore.
#
# `values` são os campos do manifesto preenchidos; `provenance` registra de
# que versão da marca a peça saiu e quais fatos (refs) consumiu, com valor —
# é o que permite dizer "o preço mudou, estas peças estão desatualizadas".
# As imagens finais ficam no Active Storage (`images`, numeradas).
class CreatePieces < ActiveRecord::Migration[8.1]
  def change
    create_table :pieces, id: :uuid do |t|
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.references :brand_core, null: false, foreign_key: true, type: :uuid
      t.references :brand_core_version, foreign_key: { on_delete: :nullify }, type: :uuid
      t.references :account, foreign_key: { on_delete: :nullify }, type: :uuid
      t.string :engine_id, null: false
      t.string :format, null: false
      t.string :title, null: false
      t.jsonb :values, null: false, default: {}
      t.string :status, null: false, default: "queued"
      t.jsonb :error
      t.jsonb :provenance, null: false, default: {}
      t.datetime :rendered_at

      t.timestamps
    end

    add_index :pieces, [ :organization_id, :created_at ]
    add_index :pieces, [ :organization_id, :engine_id ]
  end
end
