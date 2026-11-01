require "net/http"

module Ai
  # A porta para o gerador de imagens (Gemini, "Nano Banana 2") no **Vertex
  # AI** — consome os créditos do projeto no Google Cloud. A configuração e as
  # credenciais (ADC, nunca chave de API) são as de `Ai::Vertex`, divididas
  # com o embedding; aqui mora o que é da geração de imagem — e a costura por
  # onde os testes entram, sem rede.
  #
  # Fala o `generateContent`: o pedido em texto, fotos de referência opcionais
  # e `imageConfig` (proporção, tamanho). A imagem volta em base64 em
  # `candidates[].content.parts[].inlineData`.
  class GeminiImage
    # Nano Banana 2 — GA no Vertex desde 28/05/2026, disponível em `global`.
    DEFAULT_MODEL = "gemini-3.1-flash-image"
    TIMEOUT = 90
    # O `global` devolve 429 (capacidade compartilhada esgotada) com frequência
    # — 21 vezes em 30 fotos seguidas, em 2026-10-31 — e 503 de vez em quando;
    # os dois passam em segundos. Mais espera que isso pesa no turno do agente.
    RETRY_WAITS = [ 5, 15 ].freeze
    RETRYABLE = %w[429 503].freeze

    MissingKey = Vertex::MissingKey
    class Failed < StandardError; end
    # O Vertex não atendeu (429/503) nem depois das novas tentativas.
    class Busy < Failed; end
    # O modelo respondeu, mas sem imagem — em geral, filtro de segurança.
    class Blocked < StandardError; end

    Image = Struct.new(:data, :mime_type, keyword_init: true)
    Result = Struct.new(:image, :usage, :model, keyword_init: true)

    def self.model = ENV.fetch("GEMINI_IMAGE_MODEL", DEFAULT_MODEL)
    def self.project = Vertex.project
    def self.location = Vertex.location
    def self.vertex? = Vertex.vertex?
    def self.available? = vertex? && project.present? && credentials.present?
    def self.credentials = Vertex.credentials
    def self.forget_credentials! = Vertex.forget_credentials!
    def self.authorization = Vertex.authorization
    def self.endpoint(model = self.model) = Vertex.model_url(model, "generateContent", location: location)

    # Uma imagem. `references`: [{ data:, mime_type: }] das fotos da marca.
    def generate(prompt:, aspect_ratio:, references: [], size: ENV.fetch("GEMINI_IMAGE_SIZE", "1K"))
      raise MissingKey unless self.class.vertex? && self.class.project

      parts = references.map { |ref| { inlineData: { mimeType: ref[:mime_type], data: Base64.strict_encode64(ref[:data]) } } }
      body = {
        contents: [ { role: "user", parts: [ *parts, { text: prompt } ] } ],
        generationConfig: {
          responseModalities: [ "IMAGE" ],
          imageConfig: { aspectRatio: aspect_ratio, imageSize: size }
        }
      }
      payload = post(body)
      image = self.class.image_from(payload) or raise Blocked, self.class.refusal_from(payload).first(200)
      Result.new(image: image, usage: self.class.usage_from(payload), model: payload["modelVersion"].presence || self.class.model)
    end

    def self.image_from(payload)
      Array(payload["candidates"]).each do |candidate|
        Array(candidate.dig("content", "parts")).reverse_each do |part|
          inline = part["inlineData"] || part["inline_data"]
          return Image.new(data: Base64.decode64(inline["data"]), mime_type: inline["mimeType"] || inline["mime_type"] || "image/png") if inline&.dig("data").present?
        end
      end
      nil
    end

    # Por que não veio imagem: o bloqueio do pedido, o motivo do fim ou o texto
    # que o modelo devolveu no lugar.
    def self.refusal_from(payload)
      blocked = payload.dig("promptFeedback", "blockReason")
      candidate = Array(payload["candidates"]).first || {}
      text = Array(candidate.dig("content", "parts")).filter_map { |part| part["text"] }.join(" ")
      [ blocked, candidate["finishReason"], text ].compact_blank.join(" · ")
    end

    def self.usage_from(payload)
      usage = payload["usageMetadata"] || {}
      { input: usage["promptTokenCount"].to_i, output: usage["candidatesTokenCount"].to_i }
    end

    private

    def post(body)
      attempt = 0
      begin
        post_once(body)
      rescue Busy => e
        wait = RETRY_WAITS[attempt] or raise
        attempt += 1
        Rails.logger.info("[gemini-image] #{e.message.first(80)} — nova tentativa em #{wait} s")
        sleep wait
        retry
      end
    end

    def post_once(body)
      uri = self.class.endpoint
      request = Net::HTTP::Post.new(uri, "Content-Type" => "application/json", "Authorization" => self.class.authorization)
      request.body = JSON.generate(body)
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: TIMEOUT, open_timeout: 10) { |http| http.request(request) }
      payload = JSON.parse(response.body.presence || "{}")
      unless response.is_a?(Net::HTTPSuccess)
        reason = payload.dig("error", "message").to_s.first(160)
        raise Busy, "HTTP #{response.code}: #{reason}" if RETRYABLE.include?(response.code)
        raise Blocked, reason if reason.match?(/safety|blocked|policy/i)

        raise Failed, "HTTP #{response.code}: #{reason}"
      end

      payload
    rescue JSON::ParserError
      # O 503 do balanceador costuma vir em HTML: conta como ocupado também.
      raise RETRYABLE.include?(response&.code) ? Busy : Failed, "resposta não era JSON (HTTP #{response&.code})"
    rescue Signet::AuthorizationError => e
      Rails.logger.warn("[gemini-image] o Google recusou as credenciais (confira a chave do Vertex, DEPLOY.md §2): #{e.message.squish.first(200)}")
      self.class.forget_credentials!
      raise MissingKey, e.message.first(160)
    rescue Net::OpenTimeout, Net::ReadTimeout, SocketError, Errno::ECONNREFUSED => e
      raise Failed, e.class.name
    end
  end
end
