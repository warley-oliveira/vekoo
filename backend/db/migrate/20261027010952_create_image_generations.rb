# Um pedido de imagem ao gerador (Gemini): o que a pessoa descreveu, em que
# proporção, quantas opções, o que custou e quais fotos da marca saíram dele.
# As imagens viram `BrandAsset` de tipo `photo` — o pedido só guarda a conta e
# o vínculo.
class CreateImageGenerations < ActiveRecord::Migration[8.1]
  def change
    create_table :image_generations, id: :uuid do |t|
      t.references :organization, type: :uuid, null: false, foreign_key: true
      t.references :brand_core, type: :uuid, null: false, foreign_key: true
      t.references :account, type: :uuid, foreign_key: { on_delete: :nullify }
      t.text :prompt, null: false
      t.string :aspect_ratio, null: false
      t.integer :count, null: false
      t.uuid :reference_asset_id
      t.string :origin, null: false, default: "studio"
      t.string :status, null: false, default: "queued"
      t.string :model
      t.jsonb :asset_ids, null: false, default: []
      t.integer :credits_charged, null: false, default: 0
      t.bigint :cost_micro_usd, null: false, default: 0
      t.jsonb :error
      t.timestamps
    end
    add_index :image_generations, %i[brand_core_id created_at]
    add_index :image_generations, %i[organization_id created_at]
  end
end
