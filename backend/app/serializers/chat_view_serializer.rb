class ChatViewSerializer < ApplicationSerializer
  def self.one(chat_view)
    {
      id: chat_view.id,
      name: chat_view.name,
      # Mapa livre: as condições voltam como a tela as gravou.
      payload: chat_view.payload,
      personal: chat_view.personal,
      accountId: chat_view.account_id,
      createdAt: epoch_ms(chat_view.created_at),
      updatedAt: epoch_ms(chat_view.updated_at)
    }
  end
end
