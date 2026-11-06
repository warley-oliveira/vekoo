module Inbound
  # Webhooks de provedor: sem sessão, respondem 2xx e jogam o trabalho para o job. Consulta
  # pesada na thread do Puma trava a fila de requisições, o provedor reentrega e a carga se
  # realimenta. Aqui só se valida que o conector existe.
  class BaseController < ApplicationController
    # O corpo vai inteiro para o job; o wrapper de parâmetros só o duplicaria.
    wrap_parameters false

    private

    def enqueue(provider, connector_id = nil, event = nil)
      ProcessWebhookJob.perform_later(provider, utf8_body, connector_id&.to_s, event)
      head :ok
    end

    # `raw_post` vem como BINARY, e o argumento do job vira JSON no Sidekiq: acento passa com
    # um aviso (e será erro no json 3.0), e byte inválido levanta, o que seria 500 ao provedor.
    def utf8_body
      request.raw_post.dup.force_encoding(Encoding::UTF_8).scrub
    end

    # A Meta assina o corpo com o segredo do app. Sem isto, bastaria conhecer o id de uma página
    # (que é público) para injetar mensagem numa conversa e disparar fluxos. Instagram Login é
    # outro app, com outro segredo, então vale qualquer um dos dois. Sem segredo configurado
    # (desenvolvimento) não há o que conferir.
    def verify_meta_signature
      secrets = [ ENV["META_APP_SECRET"], ENV["INSTAGRAM_APP_SECRET"] ].compact_blank
      return if secrets.empty?

      signature = request.headers["X-Hub-Signature-256"].to_s
      return if secrets.any? { |secret| valid_meta_signature?(secret, signature) }

      Rails.logger.warn("[Inbound] Assinatura da Meta inválida em #{request.path}")
      render_error(status: :forbidden, code: "invalidSignature")
    end

    def valid_meta_signature?(secret, signature)
      expected = "sha256=#{OpenSSL::HMAC.hexdigest('SHA256', secret, request.raw_post)}"
      ActiveSupport::SecurityUtils.secure_compare(expected, signature)
    end

    # Verificação do webhook pela Meta: devolve o desafio cru.
    def verification_request?
      params["hub.mode"] == "subscribe"
    end

    def render_challenge(expected_token)
      if expected_token.present? && ActiveSupport::SecurityUtils.secure_compare(params["hub.verify_token"].to_s, expected_token.to_s)
        render plain: params["hub.challenge"]
      else
        render_error(status: :bad_request, code: "unauthorized")
      end
    end
  end
end
