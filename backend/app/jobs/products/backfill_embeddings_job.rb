module Products
  # Alcança os itens sem vetor: os cadastrados antes de a chave da OpenAI existir e os
  # que perderam as tentativas de EmbedItemsJob num período de instabilidade. Recorrente
  # (config/schedule/products.yml); sem chave, não faz nada.
  class BackfillEmbeddingsJob < ApplicationJob
    queue_as :low

    # Por execução, para um catálogo grande não despejar tudo na fila de uma vez.
    MAX_PER_RUN = 5_000

    def perform
      return unless Embedder.available?

      EmbedItemsJob.enqueue_for(Item.where.missing(:embedding_record).limit(MAX_PER_RUN).pluck(:id))
    end
  end
end
