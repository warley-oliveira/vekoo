module Inbound
  # Webhooks de provedor: sem sessão, respondem 2xx e jogam o trabalho para o job. Consulta
  # pesada na thread do Puma trava a fila de requisições, o provedor reentrega e a carga se
  # realimenta. Aqui só se valida que o conector existe.
  class BaseController < ApplicationController
    # O corpo vai inteiro para o job; o wrapper de parâmetros só o duplicaria.
    wrap_parameters false

    private

    def enqueue(provider, connector_id = nil, event = nil)
      ProcessWebhookJob.perform_later(provider, request.raw_post, connector_id&.to_s, event)
      head :ok
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
