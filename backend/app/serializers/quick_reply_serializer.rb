class QuickReplySerializer < ApplicationSerializer
  def self.one(quick_reply)
    {
      id: quick_reply.id,
      name: quick_reply.name,
      trigger: quick_reply.trigger,
      content: quick_reply.content,
      createdAt: epoch_ms(quick_reply.created_at),
      updatedAt: epoch_ms(quick_reply.updated_at)
    }
  end
end
