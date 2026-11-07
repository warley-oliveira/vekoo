module Pipelines
  # Fonte única da regra "quem vê quais cards" de um quadro. Com o quadro em modo `assigned`, a pessoa
  # só alcança os cards atribuídos a ela, exceto se for a dona da organização ou pertencer a um grupo
  # liberado no quadro.
  class CardVisibility
    def initialize(board, account)
      @board = board
      @account = account
    end

    def unrestricted?
      return true unless @board.card_visibility_restricted?
      # Na origem, o `super_user`. Aqui, "dono vê tudo" (`Account#permission_level`), e o dono não
      # tem grupo: sem esta linha, ele não conseguiria nem salvar a própria regra.
      return true if @account.full_access?

      @board.card_visibility_bypass_role_ids.include?(@account.access_role_id)
    end

    def scope(cards)
      unrestricted? ? cards : cards.where(assigned_to_id: @account.id)
    end

    def visible?(card)
      unrestricted? || card.assigned_to_id == @account.id
    end
  end
end
