class CreateProductItems < ActiveRecord::Migration[8.1]
  def change
    create_table :product_items, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.string :title, limit: 300, null: false
      t.string :summary, limit: 1500
      t.text :description
      # SKU / código externo do cliente. É a chave natural do upsert da importação.
      t.string :external_id
      t.string :url
      t.boolean :active, null: false, default: true
      # Valores dos campos personalizados, chaveados por product_field_definitions.key
      t.jsonb :custom_fields, null: false, default: {}
      t.string :tags, array: true, null: false, default: []

      # Texto indexável, montado em Ruby por Products::IndexTextBuilder e SEMPRE
      # normalizado (I18n.transliterate + downcase). A query de busca passa pela
      # mesma normalização, então acento deixa de importar dos dois lados — que é o
      # que importa para quem digita do celular.
      #
      # Por que normalizar em Ruby em vez de criar uma config `portuguese_unaccent`
      # no Postgres: o `schema.rb` dumpa `enable_extension` mas NÃO dumpa
      # `CREATE TEXT SEARCH CONFIGURATION`, então uma coluna gerada que dependesse
      # dela quebraria todo `db:schema:load` — inclusive o do banco de teste.
      #
      # O custo é que o stemmer e as stopwords do português são definidos sobre
      # texto acentuado: "não" transliterado deixa de ser stopword e sufixos como
      # "-ência" param de reduzir. O que mais importa num catálogo — plural
      # ("cadeiras" -> "cadeira") — usa a regra de "-s" e continua funcionando.
      t.text :index_text_primary   # título, tags, SKU
      t.text :index_text_secondary # resumo, categorias, campos personalizados, descrição

      # Coluna GERADA, não mantida por callback: o importador escreve com
      # INSERT ... ON CONFLICT, que não dispara callback nenhum do ActiveRecord.
      # Gerada, o tsvector nunca fica dessincronizado do texto indexado.
      t.virtual :search_document, type: :tsvector, stored: true, as: <<~SQL.squish
        setweight(to_tsvector('portuguese', coalesce(index_text_primary, '')), 'A') ||
        setweight(to_tsvector('portuguese', coalesce(index_text_secondary, '')), 'B')
      SQL

      t.timestamps
    end

    add_index :product_items, %i[organization_id active]
    add_index :product_items, %i[organization_id created_at]

    # Não-parcial de propósito: o ON CONFLICT do upsert da importação não consegue
    # mirar um índice parcial. Como o Postgres trata NULLs como distintos em índice
    # único, itens sem SKU sempre inserem e nunca colidem entre si — que é exatamente
    # o comportamento desejado.
    add_index :product_items, %i[organization_id external_id],
      unique: true, name: "index_product_items_on_organization_and_external_id"

    add_index :product_items, :tags, using: :gin
    add_index :product_items, :search_document, using: :gin
    add_index :product_items, :custom_fields, using: :gin, opclass: :jsonb_path_ops
  end
end
