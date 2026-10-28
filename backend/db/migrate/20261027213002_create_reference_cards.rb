# O banco de referências: posts reais analisados e guardados como texto
# estruturado, que o agente de criação consulta na geração. É acervo da
# plataforma (como os layouts), não conteúdo de cliente — por isso sem
# organização e sem marca. Quem cura fica em `curated_by` (conta da Vekoo).
#
# `hook_type`, `replicability` e `relative_engagement` são **derivados** da
# `analysis` a cada gravação: existem em coluna para a recuperação filtrar e
# diversificar sem abrir o jsonb.
#
# Sem índice HNSW no embedding de propósito: o banco é curado à mão (centenas
# de cards) e a busca vem sempre depois de um filtro duro — índice aproximado
# com filtro devolve menos vizinhos do que existem. A busca exata é a certa
# nesta escala.
class CreateReferenceCards < ActiveRecord::Migration[8.1]
  def change
    create_table :reference_cards, id: :uuid do |t|
      t.string :status, null: false, default: "draft"
      t.string :origin, null: false, default: "external"
      t.string :niche
      t.string :size
      t.string :archetypes, array: true, null: false, default: []
      t.string :objective
      t.string :format
      t.string :suggested_layout_id
      t.jsonb :analysis, null: false, default: {}
      t.jsonb :source, null: false, default: {}
      t.vector :embedding, limit: 768
      t.string :hook_type
      t.integer :replicability
      t.decimal :relative_engagement, precision: 8, scale: 2
      t.references :curated_by, type: :uuid, foreign_key: { to_table: :accounts, on_delete: :nullify }
      t.integer :version, null: false, default: 1
      t.text :archived_reason
      t.datetime :published_at
      t.timestamps
    end
    add_index :reference_cards, %i[status format replicability]
    add_index :reference_cards, :niche
    add_index :reference_cards, :archetypes, using: :gin
  end
end
