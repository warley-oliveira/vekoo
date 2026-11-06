module Products
  # O caminho de escrita do item pela tela. Os passos só fazem sentido juntos: os vínculos
  # de categoria são gravados depois do item, e o texto de busca reúne os nomes deles.
  # Sem refazer o índice aqui, o item recém-criado não seria achado pela própria categoria
  # até alguém salvá-lo uma segunda vez.
  class SaveItem
    # `category_ids: nil` deixa os vínculos como estão; `[]` remove todos.
    def initialize(item, attributes, category_ids: nil)
      @item = item
      @attributes = attributes
      @category_ids = category_ids
    end

    def call
      saved = Item.transaction do
        next false unless @item.update(@attributes)

        unless @category_ids.nil?
          @item.sync_categories(@category_ids)
          @item.refresh_index_text!
        end
        true
      end

      # Depois do commit: o job abre outra conexão e precisa enxergar o item.
      EmbedItemsJob.enqueue_for([ @item.id ]) if saved
      saved
    end
  end
end
