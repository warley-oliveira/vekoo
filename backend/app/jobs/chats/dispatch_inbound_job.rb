module Chats
  # Entrega para os fluxos uma mensagem que precisou esperar: a próxima janela de
  # atendimento ou o freio de contato (ver `Chats::InboundFlow`). Reconfere no momento de
  # rodar, porque nesse meio-tempo uma pessoa pode ter assumido a conversa.
  class DispatchInboundJob < ApplicationJob
    queue_as :default

    def perform(chat_id, organization_id, text, event, message_id)
      chat = Chat.scoped(organization_id, chat_id)
      return unless chat

      chat.set(scheduled_outside_business_work: nil) if chat.scheduled_outside_business_work.present?
      return unless chat.automation_enabled

      InboundDelivery.call(chat: chat, text: text, event: event, message_id: message_id)
    end
  end
end
