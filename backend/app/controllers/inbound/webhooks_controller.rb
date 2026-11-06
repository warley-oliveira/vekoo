module Inbound
  # POST /inbound/webhooks/:uid: a URL pública de um webhook. Responde na hora, e o trabalho vai para `Hooks::ProcessRequestJob`.
  #
  # O corpo é assinado sobre os BYTES originais (`request.raw_post`): recalcular em cima dos parâmetros já interpretados nunca
  # fecharia, porque a ordem das chaves e a formatação mudam.
  class WebhooksController < BaseController
    # Por webhook: um cliente com volume de verdade não deve bater aqui, e um atacante com o endereço não enche a fila.
    REQUESTS_PER_MINUTE = 1_200

    rate_limit to: REQUESTS_PER_MINUTE, within: 1.minute, by: -> { params[:uid].to_s }, with: -> { render_too_many_requests }

    before_action :set_hook
    before_action :reject_large_body
    before_action :verify_signature

    def receive
      # Em JSON, como os webhooks de provedor: o que vem de fora não pode depender do que o ActiveJob sabe serializar.
      Hooks::ProcessRequestJob.perform_later(@hook.id, @hook.organization_id, Hooks::Capture.from_request(request).to_json)
      render json: { success: true }
    end

    private

    # Aqui, e não num `rescue_from`: quem lê os parâmetros primeiro é `Localizable`, por fora dele. Esta URL é pública, e um corpo
    # que não é JSON é o erro mais comum de quem está integrando.
    def process_action(*)
      super
    rescue ActionDispatch::Http::Parameters::ParseError
      render_error(status: :bad_request, code: "invalidBody")
    end

    # Sem `received_payload`: é a coluna pesada, e o caminho que importa não a lê.
    def set_hook
      @hook = Hook.light.find_by(uid: params[:uid])
      render_not_found unless @hook
    end

    def reject_large_body
      return if request.raw_post.bytesize <= Hooks::Capture::MAX_BODY_BYTES

      render_error(status: :content_too_large, code: "payloadTooLarge")
    end

    def verify_signature
      return unless @hook.signature_enabled?

      result = Hooks::SignatureVerifier.new(
        @hook,
        timestamp: request.headers[Hooks::SignatureVerifier::TIMESTAMP_HEADER],
        signature: request.headers[Hooks::SignatureVerifier::SIGNATURE_HEADER],
        raw_body: request.raw_post
      ).call
      return if result.valid?

      HookLog.record(
        hook: @hook,
        capture: Hooks::Capture.for_log(Hooks::Capture.from_request(request)),
        status: "error",
        status_code: 401,
        error_message: t("automation.hooks.signature.rejected", code: result.code, message: result.message)
      )
      render_error(status: :unauthorized, code: result.code.to_s, message: result.message)
    end
  end
end
