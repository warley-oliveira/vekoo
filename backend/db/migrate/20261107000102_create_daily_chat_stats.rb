class CreateDailyChatStats < ActiveRecord::Migration[8.1]
  def change
    create_table :daily_chat_stats, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.date :day, null: false
      t.jsonb :metrics, null: false, default: {}
      t.jsonb :hourly_breakdown, null: false, default: {}

      t.timestamps
    end

    add_index :daily_chat_stats, %i[organization_id day], unique: true
    add_index :daily_chat_stats, :metrics, using: :gin
  end
end
