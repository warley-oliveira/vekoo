module Hooks
  # Verifica a assinatura HMAC-SHA256 de uma requisição recebida em POST /inbound/webhooks/:uid.
  #
  # O cliente assina "#{timestamp}.#{corpo_cru}" com o segredo do webhook e envia:
  #
  #   X-Vekoo-Timestamp: 1753800000
  #   X-Vekoo-Signature: sha256=<hexdigest>
  #
  # O timestamp entra no HMAC, então não pode ser trocado sem invalidar a assinatura, e é conferido contra uma
  # janela de tolerância, o que impede repetir uma requisição interceptada.
  class SignatureVerifier
    TOLERANCE = 5.minutes
    TIMESTAMP_HEADER = "X-Vekoo-Timestamp".freeze
    SIGNATURE_HEADER = "X-Vekoo-Signature".freeze
    SIGNATURE_FORMAT = /\Asha256=(?<digest>[0-9a-f]{64})\z/
    NUMERIC = /\A\d+\z/

    Result = Struct.new(:valid, :code, :message, keyword_init: true) do
      def valid?
        valid
      end
    end

    def self.signature_for(secret, timestamp, raw_body)
      "sha256=#{OpenSSL::HMAC.hexdigest('SHA256', secret.to_s, "#{timestamp}.#{raw_body}")}"
    end

    def initialize(hook, timestamp:, signature:, raw_body:, now: Time.current)
      @hook = hook
      @timestamp = timestamp.to_s
      # Hex maiúsculo é aceito: várias bibliotecas emitem assim, e normalizar não custa nada em segurança.
      @signature = signature.to_s.downcase
      @raw_body = raw_body.to_s
      @now = now
    end

    def call
      secret = hook.signing_secret
      return failure(:missingSecret, I18n.t("automation.hooks.signature.missing_secret")) if secret.blank?

      return failure(:missingSignature, I18n.t("automation.hooks.signature.missing_signature", header: SIGNATURE_HEADER)) if signature.blank?
      return failure(:missingTimestamp, I18n.t("automation.hooks.signature.missing_timestamp", header: TIMESTAMP_HEADER)) if timestamp.blank?

      match = SIGNATURE_FORMAT.match(signature)
      return failure(:malformedSignature, I18n.t("automation.hooks.signature.malformed", header: SIGNATURE_HEADER)) if match.nil?

      return failure(:invalidTimestamp, I18n.t("automation.hooks.signature.invalid_timestamp", header: TIMESTAMP_HEADER)) unless timestamp.match?(NUMERIC)
      return failure(:expiredTimestamp, I18n.t("automation.hooks.signature.expired")) if expired?

      return failure(:invalidSignature, I18n.t("automation.hooks.signature.invalid")) unless digest_matches?(secret, match[:digest])

      Result.new(valid: true, code: :valid, message: I18n.t("automation.hooks.signature.valid"))
    end

    private

    attr_reader :hook, :timestamp, :signature, :raw_body, :now

    def expired?
      (now.to_i - timestamp.to_i).abs > TOLERANCE.to_i
    end

    # A regex de formato roda antes: `secure_compare` não trabalha com tamanhos diferentes.
    def digest_matches?(secret, provided_digest)
      expected = self.class.signature_for(secret, timestamp, raw_body)
      expected_digest = SIGNATURE_FORMAT.match(expected)[:digest]

      ActiveSupport::SecurityUtils.secure_compare(expected_digest, provided_digest)
    end

    def failure(code, message)
      Result.new(valid: false, code: code, message: message)
    end
  end
end
