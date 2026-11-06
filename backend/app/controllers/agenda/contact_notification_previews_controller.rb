module Agenda
  # O teste dos lembretes ao contato: mostra o que uma regra enviaria, sem enviar.
  class ContactNotificationPreviewsController < BaseController
    include MessagePreview

    before_action :set_calendar

    def bookings
      render json: { bookings: booking_candidates }
    end

    # O que a pessoa escolhe para entrar no histórico da simulação: só o que entra de verdade no pedido
    # ao modelo, sem mídia nem chamada de ferramenta.
    #
    # Rota própria, com `calendar`, e não `GET /chats/:id/messages`: aquela exige `chat`, deixaria quem só
    # configura a agenda sem a escolha, e a primeira página zera as não lidas de quem é dono da conversa, o
    # que uma simulação não pode fazer. A simulação já manda este mesmo histórico ao modelo com a mesma
    # permissão. O `chat_list_to` continua valendo.
    def messages
      booking = @calendar.bookings.where(id: params.require(:booking_id).to_s).take
      chat = booking && visible_chat(booking)
      return render_not_found unless chat

      render json: { messages: ChatHistory.candidates(chat, limit: params[:limit]) }
    end

    # `messageIds` define o histórico: sem o campo, o normal; com `[]`, nenhum.
    def create
      render_preview(tools: false, message_ids: params.key?(:message_ids) ? Array(params[:message_ids]).map(&:to_s) : nil)
    end
  end
end
