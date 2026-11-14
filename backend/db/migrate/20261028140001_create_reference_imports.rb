# A importação de referências pela Business Discovery da Instagram Graph API:
# um lote de contas (`reference_imports`), o resultado de cada uma
# (`reference_import_accounts`: o erro, ou a mediana de engajamento dos posts
# puxados) e os posts candidatos (`reference_candidates`), que a curadoria
# escolhe para virar card.
#
# A legenda dos posts não tem coluna em lugar nenhum: ela é lida de novo na
# hora da análise e descartada. Candidato que não virou card é apagado em 30
# dias (`References::Imports.purge!`).
class CreateReferenceImports < ActiveRecord::Migration[8.1]
  def change
    create_table :reference_imports, id: :uuid do |t|
      t.references :curated_by, type: :uuid, foreign_key: { to_table: :accounts, on_delete: :nullify }
      t.string :niche
      t.string :size
      t.timestamps
    end
    add_index :reference_imports, :created_at

    create_table :reference_import_accounts, id: :uuid do |t|
      t.references :reference_import, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.string :username, null: false
      t.string :status, null: false, default: "pending"
      t.string :error_code
      t.datetime :retry_at
      t.string :name
      t.integer :followers_count
      t.integer :fetched_count
      t.integer :eligible_count
      t.decimal :baseline_median, precision: 12, scale: 2
      t.datetime :fetched_at
      t.timestamps
    end
    add_index :reference_import_accounts, %i[reference_import_id username], unique: true

    create_table :reference_candidates, id: :uuid do |t|
      t.references :reference_import_account, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.string :ig_media_id, null: false
      t.string :media_type, null: false
      t.string :product_type
      t.text :permalink
      t.text :preview_url
      t.integer :like_count
      t.integer :comments_count
      t.decimal :relative_engagement, precision: 8, scale: 2
      t.datetime :posted_at
      t.integer :children_count, null: false, default: 0
      t.boolean :partial, null: false, default: false
      t.string :status, null: false, default: "pending"
      t.references :reference_card, type: :uuid, foreign_key: { on_delete: :nullify }
      t.timestamps
    end
    add_index :reference_candidates, :ig_media_id
  end
end
