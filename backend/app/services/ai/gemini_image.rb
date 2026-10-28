require "net/http"
require "googleauth"

module Ai
  # A porta para o gerador de imagens (Gemini, "Nano Banana 2") no **Vertex
  # AI** — consome os créditos do projeto no Google Cloud. É o **único** lugar
  # do projeto que conhece a API do Google — e a costura por onde os testes
  # entram, sem rede.
  #
  # Autentica por Application Default Credentials (`gcloud auth
  # application-default login` no dev); nunca por chave de API. Configuração
  # pelas mesmas variáveis do SDK `google-genai`:
  #
  #   GOOGLE_GENAI_USE_VERTEXAI=True
  #   GOOGLE_CLOUD_PROJECT=<projeto>
  #   GOOGLE_CLOUD_LOCATION=global   (ou uma região, ex.: us-central1)
  #
  # Fala o `generateContent`: o pedido em texto, fotos de referência opcionais
  # e `imageConfig` (proporção, tamanho). A imagem volta em base64 em
  # `candidates[].content.parts[].inlineData`.
  class GeminiImage
    # Nano Banana 2 — GA no Vertex desde 28/05/2026, disponível em `global`.
    DEFAULT_MODEL = "gemini-3.1-flash-image"
    SCOPE = "https://www.googleapis.com/auth/cloud-platform"
    TIMEOUT = 90

    class MissingKey < StandardError; end
    class Failed < StandardError; end
    # O modelo respondeu, mas sem imagem — em geral, filtro de segurança.
    class Blocked < StandardError; end

    Image = Struct.new(:data, :mime_type, keyword_init: true)
    Result = Struct.new(:image, :usage, :model, keyword_init: true)

    CREDENTIALS_LOCK = Mutex.new

    def self.model = ENV.fetch("GEMINI_IMAGE_MODEL", DEFAULT_MODEL)
    def self.project = ENV["GOOGLE_CLOUD_PROJECT"].presence
    def self.location = ENV["GOOGLE_CLOUD_LOCATION"].presence || "global"
    def self.vertex? = ENV["GOOGLE_GENAI_USE_VERTEXAI"].to_s.match?(/\A(true|1|yes)\z/i)

    # Ligado quando o Vertex está configurado e as credenciais existem. A
    # procura das credenciais roda uma vez por processo.
    def self.available? = vertex? && project.present? && credentials.present?

    def self.credentials
      CREDENTIALS_LOCK.synchronize do
        return @credentials if defined?(@credentials)

        @credentials = begin
          Google::Auth.get_application_default([ SCOPE ])
        rescue StandardError => e
          Rails.logger.warn("[gemini-image] sem credenciais do Google: #{e.class}: #{e.message.first(160)}")
          nil
        end
      end
    end

    # Login vencido (`invalid_grant` / `invalid_rapt`: o Workspace pede
    # reautenticação de tempos em tempos) não deve exigir reiniciar o
    # processo: esquece as credenciais e a próxima chamada relê o arquivo que
    # o `gcloud auth application-default login` acabou de escrever.
    def self.forget_credentials!
      CREDENTIALS_LOCK.synchronize { remove_instance_variable(:@credentials) if defined?(@credentials) }
    end

    # O cabeçalho `Authorization` — o googleauth renova o token sozinho quando
    # expira. Com trava: várias imagens saem em paralelo, em threads.
    def self.authorization
      creds = credentials or raise MissingKey
      CREDENTIALS_LOCK.synchronize { creds.apply({})[:authorization] }
    end

    # `global` fala com o host sem região; as demais, com o regional.
    def self.endpoint(model = self.model)
      host = location == "global" ? "aiplatform.googleapis.com" : "#{location}-aiplatform.googleapis.com"
      URI("https://#{host}/v1/projects/#{project}/locations/#{location}/publishers/google/models/#{model}:generateContent")
    end

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
      uri = self.class.endpoint
      request = Net::HTTP::Post.new(uri, "Content-Type" => "application/json", "Authorization" => self.class.authorization)
      request.body = JSON.generate(body)
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: TIMEOUT, open_timeout: 10) { |http| http.request(request) }
      payload = JSON.parse(response.body.presence || "{}")
      unless response.is_a?(Net::HTTPSuccess)
        reason = payload.dig("error", "message").to_s.first(160)
        raise Blocked, reason if reason.match?(/safety|blocked|policy/i)

        raise Failed, "HTTP #{response.code}: #{reason}"
      end

      payload
    rescue JSON::ParserError
      raise Failed, "resposta não era JSON (HTTP #{response&.code})"
    rescue Signet::AuthorizationError => e
      Rails.logger.warn("[gemini-image] o Google recusou as credenciais (rode `gcloud auth application-default login`): #{e.message.squish.first(200)}")
      self.class.forget_credentials!
      raise MissingKey, e.message.first(160)
    rescue Net::OpenTimeout, Net::ReadTimeout, SocketError, Errno::ECONNREFUSED => e
      raise Failed, e.class.name
    end
  end
end
