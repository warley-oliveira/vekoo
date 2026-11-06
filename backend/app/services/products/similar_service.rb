module Products
  # Os itens mais parecidos com um item, pela distância entre embeddings. Sem vetor (sem chave
  # da OpenAI, ou item ainda não processado) não há vizinhos, e isso não é erro. Só itens
  # ativos da mesma organização, na ordem de proximidade.
  class SimilarService
    MAX_LIMIT = 20

    def initialize(organization_id, item_id, limit: 5)
      @organization_id = organization_id
      @item_id = item_id
      @limit = limit.to_i.clamp(1, MAX_LIMIT)
    end

    def call
      source = Embedding.find_by(organization_id: @organization_id, product_item_id: @item_id)
      return [] if source.nil?

      ids = source.nearest_neighbors(:embedding, distance: "cosine")
        .where(organization_id: @organization_id)
        .where.not(product_item_id: @item_id)
        .joins(:item).merge(Item.active_only)
        .limit(@limit)
        .pluck(:product_item_id)

      by_id = Item.for_organization(@organization_id).listable.where(id: ids).index_by(&:id)
      ids.filter_map { |id| by_id[id] }
    end
  end
end
