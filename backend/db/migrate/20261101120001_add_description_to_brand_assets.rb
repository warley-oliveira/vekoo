class AddDescriptionToBrandAssets < ActiveRecord::Migration[8.1]
  def change
    add_column :brand_assets, :description, :text
    add_column :brand_assets, :shows, :string, array: true, default: [], null: false
    add_column :brand_assets, :described_at, :datetime
    add_column :brand_assets, :description_cost_micro_usd, :integer, default: 0, null: false
  end
end
