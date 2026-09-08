# Histórico do Brandcore: cada publicação depois da primeira gera uma versão
# nova, com o documento inteiro (`snapshot`) e o que mudou em relação à
# anterior (`change_list`: lista de {section, path, kind}). Quem mudou fica em
# `account_id`; se a conta sair, a versão fica.
class CreateBrandCoreVersions < ActiveRecord::Migration[8.1]
  def change
    create_table :brand_core_versions, id: :uuid do |t|
      t.references :brand_core, null: false, foreign_key: true, type: :uuid
      t.references :account, foreign_key: { on_delete: :nullify }, type: :uuid
      t.integer :number, null: false
      t.jsonb :snapshot, null: false, default: {}
      t.jsonb :change_list, null: false, default: []

      t.timestamps
    end

    add_index :brand_core_versions, [ :brand_core_id, :number ], unique: true
  end
end
