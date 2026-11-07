module Chats
  # O que falta para uma mensagem que já foi gravada: não lida, prévia na lista e fluxos. Ver `Chats::InboundFlow.call`.
  class RetryInboundFlowJob < ApplicationJob
    queue_as :critical

    retry_on StandardError, wait: :polynomially_longer, attempts: 3 do |job, error|
      Rails.logger.error("[Chats::RetryInboundFlowJob] #{job.arguments.first} #{error.class}: #{error.message}")
    end

    # @param options [Hash] first_message, from_me, dispatch e count_unread, com chave texto
    def perform(chat_id, organization_id, message_id, text, options)
      chat = Chat.scoped(organization_id, chat_id)
      message = chat && ChatMessage::Base.unscoped.where(chat_id: chat.id, id: message_id).take
      return unless message

      InboundFlow.new(chat, message, text, options["first_message"], options["from_me"], options["dispatch"], options["count_unread"]).call
    end
  end
end
