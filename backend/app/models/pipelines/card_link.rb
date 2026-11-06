module Pipelines
  # O caminho de um card na tela, para aviso e push: `/pipelines/:boardId/:view`, e o `card` abre o painel.
  module CardLink
    module_function

    def path(board, card)
      "/pipelines/#{board.id}/board?card=#{card.id}"
    end
  end
end
