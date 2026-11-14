# A descrição da foto enviada, fora do upload: a resposta sai na hora e a
# descrição chega segundos depois (`DescribeBrandAsset`).
class DescribeBrandAssetJob < ApplicationJob
  queue_as :default

  def perform(asset_id)
    asset = BrandAsset.find_by(id: asset_id)
    DescribeBrandAsset.call(asset) if asset
  end
end
