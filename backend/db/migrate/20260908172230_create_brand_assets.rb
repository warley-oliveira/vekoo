# Ativos oficiais da marca: logos, glifos, fotos e arquivos de fonte. Entram
# por arquivo (Active Storage) e nunca são recriados por aproximação.
#
# `transparent` é o resultado da análise do PNG: true/false quando o servidor
# conseguiu olhar, null quando não conseguiu (a tela mantém a checagem local).
class CreateBrandAssets < ActiveRecord::Migration[8.1]
  def change
    create_table :brand_assets, id: :uuid do |t|
      t.references :brand_core, null: false, foreign_key: true, type: :uuid
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.references :account, foreign_key: { on_delete: :nullify }, type: :uuid
      t.string :kind, null: false
      # Versão clara/escura para logo e glifo; papel (display/utility) para fonte.
      t.string :variant
      t.string :filename, null: false
      t.string :content_type, null: false
      t.bigint :byte_size, null: false
      t.integer :width
      t.integer :height
      t.boolean :transparent

      t.timestamps
    end

    add_index :brand_assets, [ :brand_core_id, :kind, :created_at ]
  end
end
