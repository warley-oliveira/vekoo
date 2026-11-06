class CreateQuickReplies < ActiveRecord::Migration[8.1]
  def change
    create_table :quick_replies, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.string :name, null: false
      # O atalho que a pessoa digita no chat ("/" + trigger). Sempre em forma de slug.
      t.string :trigger, null: false
      t.text :content, null: false

      t.timestamps
    end

    add_index :quick_replies, %i[organization_id name]
    add_index :quick_replies, %i[organization_id trigger], unique: true
  end
end
