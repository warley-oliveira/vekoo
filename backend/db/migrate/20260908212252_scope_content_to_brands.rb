# Todo conteúdo nasce dentro de uma marca. A organização passa a ter várias
# marcas (cai o índice único) e carrosséis e pastas ganham a marca a que
# pertencem. As colunas nascem nulas só por causa do legado: a atribuição
# dos órfãos é a migração de dados (`bin/rails brands:migrate_orphans` ou a
# tela temporária), e a API já não cria nada sem marca.
class ScopeContentToBrands < ActiveRecord::Migration[8.1]
  def change
    remove_index :brand_cores, :organization_id, unique: true
    add_index :brand_cores, [ :organization_id, :created_at ]

    add_reference :carousels, :brand_core, foreign_key: true, type: :uuid, index: true
    add_reference :carousels, :brand_core_version, foreign_key: { on_delete: :nullify }, type: :uuid, index: true
    add_reference :folders, :brand_core, foreign_key: true, type: :uuid, index: true
  end
end
