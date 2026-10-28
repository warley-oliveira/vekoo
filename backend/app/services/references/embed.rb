module References
  # O vetor de um card, a partir do texto do padrão (`CardText`). Roda depois
  # da análise e de toda edição de conteúdo na curadoria — vetor velho mede
  # semelhança com um card que não existe mais.
  #
  # Sem Vertex, ou com falha, o card fica sem vetor (o achado `noEmbedding`
  # aparece na revisão): melhor nenhum do que um desatualizado.
  class Embed
    def initialize(client: Ai::Embeddings.new)
      @client = client
    end

    def call(card)
      return clear(card, "Vertex não configurado") unless Ai::Embeddings.available?

      card.embedding = @client.embed(CardText.call(card), task: :document)
      # Sem validação nem versão: o vetor é derivado, não conteúdo da curadoria.
      card.update_columns(embedding: card.embedding, embedded_at: Time.current)
      card
    rescue Ai::Embeddings::MissingKey, Ai::Embeddings::Failed => e
      clear(card, e.message)
    end

    private

    def clear(card, reason)
      Rails.logger.warn("reference #{card.id}: sem embedding — #{reason.to_s.first(160)}")
      card.update_columns(embedding: nil, embedded_at: nil)
      card
    end
  end
end
