# O Brandcore: a marca da organização como dado estruturado. Um por
# organização hoje (índice único) — a tabela tem id próprio para que "várias
# marcas por conta" custe só tirar o índice e abrir a rota de lista.
#
# O documento vive em jsonb, no mesmo espírito de `carousels.theme/cards`: a
# tela salva seção a seção e a forma é a de `frontend/src/lib/brand-core.ts`.
# `document` é o rascunho; `published_document` é a última versão publicada —
# é dela que a geração lê.
class CreateBrandCores < ActiveRecord::Migration[8.1]
  def change
    create_table :brand_cores, id: :uuid do |t|
      t.references :organization, null: false, foreign_key: true, type: :uuid, index: { unique: true }
      t.string :status, null: false, default: "draft"
      t.jsonb :document, null: false, default: {}
      t.jsonb :published_document
      # Etapas visitadas e a última aberta: sair e voltar retoma de onde parou,
      # em qualquer aparelho.
      t.jsonb :progress, null: false, default: {}
      t.integer :current_version, null: false, default: 0
      t.datetime :published_at

      t.timestamps
    end
  end
end
