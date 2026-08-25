# Catálogo da ferramenta: temas prontos, peças da biblioteca de imagens e as
# paletas. Não é conteúdo de ninguém — é o acervo que o produto oferece, igual
# para todas as organizações. Fica no banco (semeado) para deixar de viver
# duplicado no front.
#
# `key` é também a chave de tradução do nome visível.
class CreateCatalogTables < ActiveRecord::Migration[8.1]
  def change
    create_table :theme_presets, id: :uuid do |t|
      t.string :key, null: false
      t.jsonb :theme, null: false
      t.integer :position, null: false, default: 0

      t.timestamps
    end
    add_index :theme_presets, :key, unique: true

    create_table :library_images, id: :uuid do |t|
      t.string :key, null: false
      # Cor de base e as camadas de gradiente pintadas por cima, em ordem.
      t.string :base, null: false
      t.jsonb :layers, null: false, default: []
      t.integer :position, null: false, default: 0

      t.timestamps
    end
    add_index :library_images, :key, unique: true

    # Uma tabela para as três paletas: cor de pasta, acento e paleta ampla.
    create_table :palette_colors, id: :uuid do |t|
      t.string :group, null: false
      # Só a paleta de pastas tem nome traduzido; nas outras a cor é a própria.
      t.string :key
      t.string :value, null: false
      t.integer :position, null: false, default: 0

      t.timestamps
    end
    add_index :palette_colors, [ :group, :position ]
    add_index :palette_colors, [ :group, :value ], unique: true
  end
end
