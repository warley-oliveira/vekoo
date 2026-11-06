class ChatTagSerializer < ApplicationSerializer
  def self.one(tag)
    {
      id: tag.id.to_s,
      name: tag.name,
      description: tag.description,
      color: tag.color,
      createdAt: epoch_ms(tag.created_at)
    }
  end
end
