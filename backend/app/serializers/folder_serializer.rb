class FolderSerializer < ApplicationSerializer
  def self.one(folder)
    {
      id: folder.id,
      name: folder.name,
      brandId: folder.brand_core_id,
      color: folder.color,
      createdAt: epoch_ms(folder.created_at)
    }
  end
end
