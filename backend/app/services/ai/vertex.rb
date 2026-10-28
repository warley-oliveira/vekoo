require "googleauth"

module Ai
  # O acesso ao Vertex AI que o gerador de imagens (`Ai::GeminiImage`) e o de
  # embedding (`Ai::Embeddings`) dividem: configuração e credenciais.
  #
  # Autentica pela conta de serviço de `GOOGLE_CREDENTIALS_BASE64` (produção,
  # DEPLOY.md) ou por Application Default Credentials (`gcloud auth
  # application-default login` no dev); nunca por chave de API. Configuração
  # pelas mesmas variáveis do SDK `google-genai`:
  #
  #   GOOGLE_GENAI_USE_VERTEXAI=True
  #   GOOGLE_CLOUD_PROJECT=<projeto>
  #   GOOGLE_CLOUD_LOCATION=global   (ou uma região, ex.: us-central1)
  module Vertex
    SCOPE = "https://www.googleapis.com/auth/cloud-platform"

    class MissingKey < StandardError; end

    CREDENTIALS_LOCK = Mutex.new

    module_function

    def project = ENV["GOOGLE_CLOUD_PROJECT"].presence
    def location = ENV["GOOGLE_CLOUD_LOCATION"].presence || "global"
    def vertex? = ENV["GOOGLE_GENAI_USE_VERTEXAI"].to_s.match?(/\A(true|1|yes)\z/i)

    # Ligado quando o Vertex está configurado e as credenciais existem. A
    # procura das credenciais roda uma vez por processo.
    def available? = vertex? && project.present? && credentials.present?

    def credentials
      CREDENTIALS_LOCK.synchronize do
        return @credentials if defined?(@credentials)

        @credentials = begin
          service_account || Google::Auth.get_application_default([ SCOPE ])
        rescue StandardError => e
          Rails.logger.warn("[vertex] sem credenciais do Google: #{e.class}: #{e.message.first(160)}")
          nil
        end
      end
    end

    # Produção: a chave JSON de uma conta de serviço dedicada (só o papel
    # "Vertex AI User"), em base64 num segredo do Kamal — o env-file do Docker
    # não aceita valor com várias linhas, e credencial pessoal (ADC) não vai
    # para servidor. Segredo presente e inválido não cai no ADC: falha à vista
    # (indisponível, com log), em vez de usar outra identidade sem avisar.
    def service_account
      encoded = ENV["GOOGLE_CREDENTIALS_BASE64"].presence or return nil

      Google::Auth::ServiceAccountCredentials.make_creds(
        json_key_io: StringIO.new(Base64.strict_decode64(encoded.strip)), scope: [ SCOPE ]
      )
    end

    # Login vencido (`invalid_grant` / `invalid_rapt`: o Workspace pede
    # reautenticação de tempos em tempos) não deve exigir reiniciar o
    # processo: esquece as credenciais e a próxima chamada relê o arquivo que
    # o `gcloud auth application-default login` acabou de escrever.
    def forget_credentials!
      CREDENTIALS_LOCK.synchronize { remove_instance_variable(:@credentials) if defined?(@credentials) }
    end

    # O cabeçalho `Authorization` — o googleauth renova o token sozinho quando
    # expira. Com trava: várias chamadas saem em paralelo, em threads.
    def authorization
      creds = credentials or raise MissingKey
      CREDENTIALS_LOCK.synchronize { creds.apply({})[:authorization] }
    end

    # `global` fala com o host sem região; as demais, com o regional.
    def host(location = self.location)
      location == "global" ? "aiplatform.googleapis.com" : "#{location}-aiplatform.googleapis.com"
    end

    def model_url(model, verb, location: self.location)
      URI("https://#{host(location)}/v1/projects/#{project}/locations/#{location}/publishers/google/models/#{model}:#{verb}")
    end
  end
end
