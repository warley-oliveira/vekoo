module Ai
  # A geração de conteúdo, em fluxo.
  #
  # Por que SSE e não uma resposta única: o editor insere card a card e mostra o
  # contador na trilha. Esperar trinta segundos por um JSON pronto destruiria a
  # única parte da experiência que justifica a espera. Cancelar vira fechar a
  # conexão — o `AbortSignal` do `fetch` aborta, a escrita aqui levanta, e o
  # stream do modelo é encerrado junto.
  #
  # Erro **antes** do primeiro byte usa o formato de erro de sempre, com status
  # HTTP. Depois que o stream abriu o 200 já foi: aí o erro é um evento.
  class GenerationsController < AuthenticatedController
    include ActionController::Live

    def rewrite
      text = params.require(:text).to_s
      intent = params[:intent].to_s

      stream_text(
        cost: cost_for(:rewrite),
        system: Prompts::VOICE,
        prompt: Prompts.rewrite(text, intent),
        max_tokens: 2_000
      )
    end

    def caption
      title = params[:title].to_s
      card_text = params[:cardText].to_s

      stream_text(
        cost: cost_for(:caption),
        system: Prompts::VOICE,
        prompt: Prompts.caption(title, card_text),
        max_tokens: 2_000
      )
    end

    private

    def cost_for(operation)
      CatalogSerializer::AI_COSTS.fetch(operation)
    end

    # O esqueleto de toda geração de texto: reserva, abre o cano, escreve o
    # acumulado a cada pedaço e fecha.
    def stream_text(cost:, system:, prompt:, max_tokens:)
      run = Run.new(current_organization, cost: cost)

      begin
        run.call do |session|
          open_stream!
          sse = Sse.new(response.stream)
          sse.write(:start, { credits: session.credits })

          accumulated = +""
          begin
            session.chat.stream_text(
              system: system, prompt: prompt, max_tokens: max_tokens
            ) do |piece|
              accumulated << piece
              session.delivered!
              # Acumulado, não incremento: é o que o editor espera — ele
              # substitui o bloco inteiro a cada passo, então receber o texto
              # completo evita que a tela precise remontá-lo.
              sse.write(:delta, { text: accumulated })
            end
          rescue Chat::MissingKey
            Rails.logger.error("ai: ANTHROPIC_API_KEY ausente")
            session.refund_unless_delivered
            return sse.write(:error, error_payload("failed"))
          rescue Chat::Failed => e
            Rails.logger.error("ai: #{e.message}")
            session.refund_unless_delivered
            return sse.write(:error, error_payload("failed"))
          end

          sse.write(:done, { text: accumulated, credits: session.credits })
        end
      rescue Organization::NoCreditsError
        # Antes de qualquer escrita: dá para responder com status de verdade.
        render_error(status: :unprocessable_entity, code: "noCredits", message: t("credits.no_credits"))
      rescue Run::Busy
        render_error(status: :conflict, code: "busy", message: t("ai.busy"))
      rescue ActionController::Live::ClientDisconnected, IOError
        # A pessoa fechou a aba ou cancelou. Não é erro: o `ensure` do Run já
        # cobrou ou estornou conforme o que tinha sido entregue.
        Rails.logger.info("ai: cliente desconectou")
      ensure
        response.stream.close if @stream_open
      end
    end

    def open_stream!
      response.headers["Content-Type"] = "text/event-stream"
      response.headers["Cache-Control"] = "no-cache"
      # Para qualquer proxy no caminho não segurar a resposta esperando o fim.
      response.headers["X-Accel-Buffering"] = "no"
      response.headers.delete("Content-Length")
      @stream_open = true
    end

    def error_payload(code)
      { error: { code: code, message: t("ai.#{code}") } }
    end
  end
end
