class ImageGenerationSerializer < ApplicationSerializer
  def self.one(generation)
    {
      id: generation.id,
      brandId: generation.brand_core_id,
      prompt: generation.prompt,
      aspectRatio: generation.aspect_ratio,
      count: generation.count,
      origin: generation.origin,
      referenceAssetId: generation.reference_asset_id,
      status: generation.status,
      error: generation.error&.dig("code"),
      creditsCharged: generation.credits_charged,
      # As fotos que saíram — já como ativos da marca (a tela usa o mesmo
      # formato do resto dos ativos).
      assets: BrandAssetSerializer.many(generation.assets.with_attached_file.order(:created_at)),
      createdAt: epoch_ms(generation.created_at),
      updatedAt: epoch_ms(generation.updated_at)
    }
  end
end
