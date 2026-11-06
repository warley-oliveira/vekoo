module Products
  # Único ponto que gera embeddings do catálogo.
  #
  # Modelo `text-embedding-3-small` truncado em 512 dimensões: ele é treinado com
  # Matryoshka, então truncar custa pouca qualidade e deixa a linha e o scan 3x
  # menores — relevante porque a busca faz KNN exato escopado por organização.
  #
  # Tudo aqui é opcional: sem OPENAI_API_KEY o catálogo funciona inteiro, nenhum vetor é
  # gerado e a busca fica só no texto. Quando a chave aparece, BackfillEmbeddingsJob
  # alcança o que já estava cadastrado.
  class Embedder
    MODEL = "text-embedding-3-small"
    DIMENSIONS = 512
    # Limite da API por requisição; ficamos folgados.
    BATCH_SIZE = 100
    # A busca pode rodar na thread do Puma. Um cache miss não pode pendurá-la: estoura
    # o timeout e a busca degrada para lexical.
    QUERY_TIMEOUT = 3
    QUERY_CACHE_TTL = 6.hours

    class << self
      def available?
        api_key.present?
      end

      # Embedding da query do usuário, cacheado. Devolve nil (em vez de levantar)
      # quando não há chave, ou quando a OpenAI falha ou demora — quem chama degrada
      # para full-text.
      def for_query(text)
        return nil unless available?

        normalized = text.to_s.squish.downcase
        return nil if normalized.blank?

        cached = Rails.cache.read(query_cache_key(normalized))
        return unpack(cached) if cached

        vector = Timeout.timeout(QUERY_TIMEOUT) { embed([ normalized ]).first }
        return nil if vector.blank?

        # Guardado empacotado (2 KB) em vez de JSON (~12 KB): cache de busca não pode
        # inflar o Redis que também atende a fila.
        Rails.cache.write(query_cache_key(normalized), pack(vector), expires_in: QUERY_CACHE_TTL)
        vector
      rescue StandardError => e
        Rails.logger.warn("[Products::Embedder] embedding da busca falhou: #{e.class}: #{e.message}")
        nil
      end

      # Embeddings de documentos (importação / reindexação). Aqui a exceção sobe:
      # roda em job, que tem retry.
      def embed(texts)
        return [] unless available?

        inputs = Array(texts).map { |text| text.to_s.strip }.reject(&:empty?)
        return [] if inputs.empty?

        inputs.each_slice(BATCH_SIZE).flat_map do |slice|
          response = client.embeddings(parameters: { model: MODEL, input: slice, dimensions: DIMENSIONS })
          Array(response["data"]).sort_by { |entry| entry["index"].to_i }.map { |entry| entry["embedding"] }
        end
      end

      def source_hash(text)
        Digest::SHA256.hexdigest("#{MODEL}:#{DIMENSIONS}:#{text}")
      end

      # Literal aceito pelo pgvector. O ActiveRecord não tem bind type `vector`,
      # então o vetor entra como texto e é convertido com ::vector no SQL.
      def to_sql_literal(vector)
        "[#{Array(vector).map { |value| value.to_f.round(7) }.join(",")}]"
      end

      private

      def api_key
        ENV["OPENAI_API_KEY"]
      end

      # Sem memoizar: criar o cliente é barato e a chave pode mudar entre processos de
      # teste. A conexão de verdade o ruby-openai abre a cada requisição.
      def client
        OpenAI::Client.new(access_token: api_key)
      end

      def query_cache_key(normalized)
        "products.query_embedding.#{DIMENSIONS}.#{Digest::SHA256.hexdigest(normalized)[0, 32]}"
      end

      def pack(vector)
        Array(vector).map(&:to_f).pack("f*")
      end

      def unpack(blob)
        blob.unpack("f*")
      end
    end
  end
end
