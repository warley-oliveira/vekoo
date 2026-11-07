module Chats
  # O que a pessoa manda por `ChatChannel` e precisa falar com o provedor. A resposta volta pelo próprio canal, nas transmissões da
  # mensagem. Ver a razão de não rodar no canal em `ChatChannel`.
  class OperatorActionJob < ApplicationJob
    queue_as :critical
    # Sem nova tentativa: o envio pode já ter saído. A tela mostra "não enviada" e oferece tentar de novo.
    sidekiq_options retry: false

    # @param action [String] send_message, send_reaction ou send_template_message
    # @param data [Hash] o que a ação pede, com chave texto
    def perform(action, chat_id, organization_id, account_id, data)
      account = Account.active.find_by(id: account_id, organization_id: organization_id)
      chat = account && Chat.visible_to(account).where(id: chat_id).take
      return unless chat

      case action
      when "send_message" then send_message(chat, account, data)
      when "send_reaction" then send_reaction(chat, account, data)
      when "send_template_message" then send_template_message(chat, account, data)
      end
    end

    private

    def send_message(chat, account, data)
      Chats::SendOperatorMessage.call(chat: chat, account: account, text: data["text"], reply_to_message_id: data["reply_to_message_id"])
    end

    # Em caso de sucesso não há transmissão aqui: a mensagem transmite sozinha quando
    # `reactions` muda, e a tela funde por `id`. Só a falha precisa de evento próprio, para a
    # tela reverter a atualização otimista.
    def send_reaction(chat, account, data)
      target = ChatMessage::Base.unscoped.where(chat_id: chat.id, id: data["message_id"].to_s).take
      return Rails.logger.warn("[Chats::OperatorActionJob] Mensagem da reação não encontrada") if target.nil?

      result = Messages::ReactionService.new(message: target, emoji: data["emoji"], account: account).call

      broadcast_reaction_failure(chat, target, result.errors) unless result.success?
    rescue StandardError => e
      Rails.logger.error("[Chats::OperatorActionJob] send_reaction: #{e.full_message}")
    end

    def send_template_message(chat, account, data)
      chat.updated_by_account = account
      chat.pause_automation_for_human!

      template = chat.connector.whatsapp_templates.where(template_id: data["template_id"]).take
      return Rails.logger.error("[Chats::OperatorActionJob] Modelo não encontrado: #{data['template_id']}") unless template

      Chats::SendTemplate.call(chat: chat, template: template, components: data["components"], account: account)
    rescue StandardError => e
      Rails.logger.error("[Chats::OperatorActionJob] send_template_message: #{e.full_message}")
    end

    # Manda o estado atual das reações junto com o erro: a tela reverte sem refazer a lista.
    def broadcast_reaction_failure(chat, message, errors)
      ActionCable.server.broadcast(
        ChatMessage::Base.stream_for(chat),
        {
          event: "message_reaction_failed",
          id: message.id.to_s,
          reactions: ChatMessageSerializer.reactions(message),
          errors: errors
        }
      )
    end
  end
end
