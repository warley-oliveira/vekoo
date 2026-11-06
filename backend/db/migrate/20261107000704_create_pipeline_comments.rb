# Comentários, reações e anexos de comentário.
class CreatePipelineComments < ActiveRecord::Migration[8.1]
  def change
    create_table :pipeline_comments, id: :uuid do |t|
      t.references :card, null: false, type: :uuid, index: false,
        foreign_key: { to_table: :pipeline_cards, on_delete: :cascade }
      # Quem escreveu: uma pessoa, ou a automação (`script`, `flow`). Na origem era a pessoa ou o
      # assistente. Pessoa apagada deixa o comentário de pé, sem autor.
      t.references :account, type: :uuid, index: true, foreign_key: { on_delete: :nullify }
      t.string :automation_source
      t.text :body, null: false
      t.datetime :edited_at
      t.uuid :parent_id
      t.boolean :pinned, null: false, default: false

      t.timestamps
    end

    add_foreign_key :pipeline_comments, :pipeline_comments, column: :parent_id, on_delete: :cascade
    add_index :pipeline_comments, :parent_id
    add_index :pipeline_comments, %i[card_id created_at]
    add_index :pipeline_comments, %i[card_id pinned created_at]

    create_table :pipeline_comment_reactions, id: :uuid do |t|
      t.references :pipeline_comment, null: false, type: :uuid, index: false, foreign_key: { on_delete: :cascade }
      t.references :account, null: false, type: :uuid, index: true, foreign_key: { on_delete: :cascade }
      t.string :emoji, null: false, limit: 20
      t.datetime :created_at, null: false
    end

    add_index :pipeline_comment_reactions, %i[pipeline_comment_id account_id emoji], unique: true,
      name: "index_pipeline_comment_reactions_unique"

    create_table :pipeline_comment_attachments, id: :uuid do |t|
      t.references :pipeline_comment, null: false, type: :uuid, index: true, foreign_key: { on_delete: :cascade }
      t.string :file_name
      t.string :content_type
      t.bigint :file_size
      t.datetime :created_at, null: false
    end
  end
end
