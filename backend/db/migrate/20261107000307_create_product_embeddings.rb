class CreateProductEmbeddings < ActiveRecord::Migration[8.1]
  # 512 dimensões, não 1536. `text-embedding-3-small` é treinado com Matryoshka,
  # então truncar para 512 custa pouca qualidade de recuperação e deixa a linha e o
  # scan 3x menores — o que importa de verdade aqui, porque a busca faz KNN exato
  # (ver comentário do índice abaixo).
  DIMENSIONS = 512

  def change
    create_table :product_embeddings, id: :uuid do |t|
      t.references :product_item, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: { unique: true }
      # Denormalizado para que o filtro de tenant não precise de join.
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.vector :embedding, limit: DIMENSIONS
      # SHA do texto que gerou o vetor — evita re-embed de item que não mudou.
      t.string :source_hash, null: false
      t.string :model, null: false

      t.timestamps
    end

    # SEM índice vetorial, de propósito.
    #
    # Um índice HNSW é um grafo único e global sobre TODAS as organizações. Como toda
    # query nossa filtra por `organization_id`, o planner ou usa o HNSW e pós-filtra —
    # devolvendo silenciosamente menos resultados (e piores) para qualquer organização
    # que não seja a maior —, ou ignora o índice. O scan iterativo do pgvector 0.8+
    # atenua isso, mas não elimina.
    #
    # Com um catálogo por organização (milhares a dezenas de milhares de itens), o KNN
    # exato escopado custa poucos milissegundos, tem recall de 100% e compõe com
    # qualquer filtro. O índice abaixo é o que restringe o scan ao tenant.
    #
    # Quando alguma organização passar de ~50k itens, avaliar HNSW com
    # `CREATE INDEX CONCURRENTLY` (em migration com `disable_ddl_transaction!`) e
    # `SET LOCAL hnsw.ef_search` — nunca `SET` sem `LOCAL`, que vaza na conexão do pool.
    add_index :product_embeddings, %i[organization_id product_item_id],
      name: "index_product_embeddings_on_organization_and_item"
  end
end
