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

  # O que fala com o provedor não roda aqui: as ações do Action Cable dividem um pool de 4 threads por processo, o mesmo que aceita
  # conexões e entrega os eventos de todas as organizações, e um provedor mudo segura cada envio por 60 s. A resposta continua voltando
  # por este canal, que é o que a tela escuta. Ver `Chats::OperatorActionJob`.

  # { chatId, message, replyToMessageId? }
  def send_message(data)
    enqueue_action("send_message", data, text: data["message"], reply_to_message_id: data["replyToMessageId"] || data["reply_to_message_id"])
  end

  # { chatId, messageId, emoji } (emoji vazio remove a reação)
  def send_reaction(data)
    enqueue_action("send_reaction", data, message_id: data["messageId"] || data["message_id"], emoji: data["emoji"])
  end

  # { chatId, templateId, components }
  def send_template_message(data)
    enqueue_action("send_template_message", data, template_id: data["templateId"] || data["template_id"], components: data["components"])
  end

  private

  def enqueue_action(action, data, **details)
    chat = chat_from(data)
    return unless chat

    Chats::OperatorActionJob.perform_later(action, chat.id.to_s, chat.organization_id, current_account.id, details.stringify_keys)
  end

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
end
