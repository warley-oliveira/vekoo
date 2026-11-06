module Pipelines
  # Os cards de uma conversa, em todos os quadros: o que o painel do contato mostra no chat. Sem esta
  # rota, a tela faria uma requisição por quadro a cada conversa aberta.
  class ChatCardsController < BaseController
    # Conversa com mais cards do que isto é exceção; o painel é estreito e o quadro segue sendo o lugar deles.
    MAX_CARDS = 50

    # GET /pipelines/cards?chatId=
    def index
      chat = Chat.visible_to(current_account).where(id: params.require(:chat_id).to_s).take
      raise ActiveRecord::RecordNotFound unless chat

      cards = chat.pipeline_cards.active.includes(CardSerializer::PRELOADS)
                  .reorder(updated_at: :desc).limit(MAX_CARDS).to_a
                  .select { |card| listable?(card) }

      render json: { cards: CardSerializer.many(cards, viewer: current_account).zip(cards).map { |json, card| with_place(json, card) } }
    end

    private

    # Quadro arquivado saiu do menu, e quadro restrito só mostra o que é da pessoa.
    def listable?(card)
      board = card.stage.board

      !board.archived && visibility_for(board).visible?(card)
    end

    # O card só conhece a etapa pelo id, e aqui não há um quadro aberto para dar o nome.
    def with_place(json, card)
      board = card.stage.board

      json.merge(
        stage: { id: card.stage.id, name: card.stage.name },
        board: { id: board.id, name: board.name, color: board.color }
      )
    end
  end
end
