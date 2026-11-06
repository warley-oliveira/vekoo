module Products
  # Gera/atualiza os embeddings de itens do catálogo.
  #
  # Sempre em job: chamada a LLM nunca na thread de requisição. Fila `low`, porque a
  # busca funciona sem o vetor, só com menos precisão, enquanto ele não fica pronto.
  class EmbedItemsJob < ApplicationJob
    queue_as :low

    BATCH_SIZE = 100

    # Esgotadas as tentativas, desiste sem barulho: o item segue achável por texto, e a
    # varredura de BackfillEmbeddingsJob o alcança depois que a OpenAI voltar.
    retry_on Faraday::Error, wait: :polynomially_longer, attempts: 3 do |job, error|
      Rails.logger.warn("[Products::EmbedItemsJob] desistiu de #{job.arguments.first.size} itens: #{error.class}: #{error.message}")
    end

    # Sem chave nem enfileira: não há por que encher a fila de jobs que não fazem nada.
    def self.enqueue_for(item_ids)
      return unless Embedder.available?

      Array(item_ids).each_slice(BATCH_SIZE) { |slice| perform_later(slice) }
    end

    def perform(item_ids)
      return unless Embedder.available?

      Array(item_ids).uniq.each_slice(BATCH_SIZE) { |slice| process_slice(slice) }
    end

    private

    def process_slice(ids)
      items = Item.where(id: ids).includes(:categories).to_a
      return if items.empty?

      existing = Embedding.where(product_item_id: items.map(&:id)).pluck(:product_item_id, :source_hash).to_h
      pending = pending_entries(items, existing)
      return if pending.empty?

      vectors = Embedder.embed(pending.map { |entry| entry[:text] })
      persist(pending, vectors)
    end

    def pending_entries(items, existing)
      searchable_keys = searchable_keys_by_organization(items)

      items.filter_map do |item|
        text = item.embedding_source_text(field_definitions: searchable_keys.fetch(item.organization_id, []))
        next if text.blank?

        hash = Embedder.source_hash(text)
        # Item salvo mas com texto indexável inalterado não paga um centavo de OpenAI.
        next if existing[item.id] == hash

        { item: item, text: text, hash: hash }
      end
    end

    def searchable_keys_by_organization(items)
      FieldDefinition.searchable_only
        .where(organization_id: items.map(&:organization_id).uniq)
        .pluck(:organization_id, :key)
        .group_by(&:first)
        .transform_values { |pairs| pairs.map(&:last) }
    end

    def persist(pending, vectors)
      now = Time.current
      rows = pending.each_with_index.filter_map do |entry, index|
        vector = vectors[index]
        next if vector.blank?

        {
          product_item_id: entry[:item].id,
          organization_id: entry[:item].organization_id,
          embedding: vector,
          source_hash: entry[:hash],
          model: Embedder::MODEL,
          created_at: now,
          updated_at: now
        }
      end
      return if rows.empty?

      Embedding.upsert_all(rows, unique_by: :product_item_id)
    end
  end
end
