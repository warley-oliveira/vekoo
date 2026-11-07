# Tempo real de uma conversa aberta. Recebe as mensagens novas e atualizadas (status,
# reação, apagada) e é por aqui que a tela envia. Ver docs/migration/api/connectors.md.
class ChatChannel < ApplicationCable::Channel
  def subscribed
    chat = find_chat(params[:chatId] || params[:chat_id])
    return reject unless chat && current_account.can?(:chat)

    @chat_id = chat.id.to_s
    stream_from ChatMessage::Base.stream_for(chat), coder: ActiveSupport::JSON do |message|
      deliver_from_stream(message)
    end
  rescue StandardError => e
    Rails.logger.error(e.full_message)
    reject
  end

  def unsubscribed
    stop_all_streams
  end

  def unsubscribe
    stop_all_streams
  end

  # { chatId, message, replyToMessageId? }
  def send_message(data)
    chat = chat_from(data)
    return unless chat

    Chats::SendOperatorMessage.call(
      chat: chat,
      account: current_account,
      text: data["message"],
      reply_to_message_id: data["replyToMessageId"] || data["reply_to_message_id"]
    )
  end

  # { chatId, messageId, emoji } (emoji vazio remove a reação)
  #
  # Em caso de sucesso não há transmissão aqui: a mensagem transmite sozinha quando
  # `reactions` muda, e a tela funde por `id`. Só a falha precisa de evento próprio, para a
  # tela reverter a atualização otimista.
  def send_reaction(data)
    chat = chat_from(data)
    return unless chat

    target = ChatMessage::Base.unscoped.where(chat_id: chat.id, id: (data["messageId"] || data["message_id"]).to_s).take
    return Rails.logger.warn("[ChatChannel] Mensagem da reação não encontrada") if target.nil?

    result = Messages::ReactionService.new(message: target, emoji: data["emoji"], account: current_account).call

    broadcast_reaction_failure(chat, target, result.errors) unless result.success?
  rescue StandardError => e
    Rails.logger.error("[ChatChannel] send_reaction: #{e.full_message}")
  end

  # { chatId, templateId, components }
  def send_template_message(data)
    chat = chat_from(data)
    return unless chat

    chat.updated_by_account = current_account
    chat.pause_automation_for_human!

    template = chat.connector.whatsapp_templates.where(template_id: data["templateId"] || data["template_id"]).take
    return Rails.logger.error("[ChatChannel] Modelo não encontrado: #{data['templateId']}") unless template

    Chats::SendTemplate.call(chat: chat, template: template, components: data["components"], account: current_account)
  rescue StandardError => e
    Rails.logger.error("[ChatChannel] send_template_message: #{e.full_message}")
  end

  private

  # Tudo o que a conversa transmite passa por aqui. O aviso de que a atribuição mudou não vai para a tela: é a deixa para conferir de
  # novo, e quem não enxerga mais a conversa para de ouvir.
  def deliver_from_stream(message)
    return transmit(message) unless message["event"] == Chat::ACCESS_CHANGED_EVENT

    stop_all_streams if find_chat(@chat_id).nil?
  end

  def chat_from(data)
    return nil unless current_account.can?(:chat)

    find_chat(data["chatId"] || data["chat_id"])
  end

  # O mesmo critério da API REST: quem não enxerga a conversa pela lista (`chat_list_to`)
  # também não a alcança pelo WebSocket, nem para ler, nem para enviar.
  def find_chat(id)
    return nil if id.blank?

    Chat.visible_to(current_account).where(id: id.to_s).take
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
