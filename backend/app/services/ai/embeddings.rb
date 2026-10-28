require "net/http"

module Ai
  # Embedding de texto no Vertex AI (`gemini-embedding-001`, multilíngue) — o
  # vetor do banco de referências. Mesmas credenciais do gerador de imagens
  # (`Ai::Vertex`); a Anthropic não tem endpoint de embedding.
  #
  # O card e o pedido são embutidos com tarefas diferentes
  # (`RETRIEVAL_DOCUMENT` × `RETRIEVAL_QUERY`): o modelo os aproxima melhor
  # assim do que com o mesmo tipo dos dois lados.
  #
  # Sem Vertex configurado, `available?` é falso e quem chama segue sem vetor —
  # a similaridade só deixa de pontuar, nada quebra.
  class Embeddings
    DEFAULT_MODEL = "gemini-embedding-001"
    # O tamanho da coluna `reference_cards.embedding`. Mudar aqui é migration.
    DIMENSIONS = 768
    TIMEOUT = 20
    TASKS = { document: "RETRIEVAL_DOCUMENT", query: "RETRIEVAL_QUERY" }.freeze

    class Failed < StandardError; end
    MissingKey = Vertex::MissingKey

    def self.model = ENV.fetch("EMBEDDING_MODEL", DEFAULT_MODEL)
    # Região própria: o modelo de embedding não está em todo lugar onde o de
    # imagem está (o `global` do Nano Banana, por exemplo).
    def self.location = ENV["EMBEDDING_LOCATION"].presence || "us-central1"
    def self.available? = Vertex.available?

    # Um texto → um vetor de `DIMENSIONS` floats. O modelo aceita um texto por
    # chamada no Vertex.
    def embed(text, task: :document)
      raise MissingKey unless Vertex.vertex? && Vertex.project

      body = {
        instances: [ { content: text.to_s, task_type: TASKS.fetch(task) } ],
        parameters: { outputDimensionality: DIMENSIONS, autoTruncate: true }
      }
      values = post(body).dig("predictions", 0, "embeddings", "values")
      raise Failed, "resposta sem vetor" unless values.is_a?(Array) && values.length == DIMENSIONS

      values.map(&:to_f)
    end

    private

    def post(body)
      uri = Vertex.model_url(self.class.model, "predict", location: self.class.location)
      request = Net::HTTP::Post.new(uri, "Content-Type" => "application/json", "Authorization" => Vertex.authorization)
      request.body = JSON.generate(body)
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: TIMEOUT, open_timeout: 10) { |http| http.request(request) }
      payload = JSON.parse(response.body.presence || "{}")
      raise Failed, "HTTP #{response.code}: #{payload.dig('error', 'message').to_s.first(160)}" unless response.is_a?(Net::HTTPSuccess)

      payload
    rescue JSON::ParserError
      raise Failed, "resposta não era JSON (HTTP #{response&.code})"
    rescue Signet::AuthorizationError => e
      Rails.logger.warn("[embeddings] o Google recusou as credenciais (rode `gcloud auth application-default login`): #{e.message.squish.first(200)}")
      Vertex.forget_credentials!
      raise MissingKey, e.message.first(160)
    rescue Net::OpenTimeout, Net::ReadTimeout, SocketError, Errno::ECONNREFUSED => e
      raise Failed, e.class.name
    end
  end
end
