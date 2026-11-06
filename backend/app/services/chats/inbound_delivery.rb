module Chats
  # A chamada ao dispatcher de fluxos. Erro de automação nunca derruba o recebimento: a
  # mensagem já está salva e a pessoa consegue responder.
  module InboundDelivery
    module_function

    def call(chat:, text:, event:, message_id:)
      Flows::InboundDispatcher.call(chat: chat, text: text, event: event, message_id: message_id)
    rescue StandardError => e
      Rails.logger.error("[Chats::InboundDelivery] #{e.class}: #{e.message} chat=#{chat.id}")
      nil
    end
  end
end
