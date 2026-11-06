module Widget
  module V1
    # Atualizações do contexto da página entre mensagens (navegação em SPA, eventos). Nunca
    # cria conversa: antes da primeira mensagem não há a que anexar, e o widget guarda o
    # contexto para mandar junto com o próximo POST /messages.
    class ContextController < Widget::BaseController
      MAX_BODY_BYTES = 16 * 1024

      before_action :authenticate_widget_session!
      before_action :throttle_context!

      # PUT /widget/v1/context
      # Corpo: { context: { page: {...}, product: {...}, visitor: {...}, events: [...] } }
      def update
        return render_context_too_large if request.raw_post.to_s.bytesize > MAX_BODY_BYTES

        chat = find_chat
        return render(json: { stored: false }, status: :accepted) unless chat

        begin
          sanitized = ::Widget::ContextSanitizer.new(params[:context], connector: @widget_connector).perform
        rescue ::Widget::ContextSanitizer::ContextTooLargeError
          return render_context_too_large
        end
        return render(json: { stored: false }, status: :accepted) if sanitized.blank?

        apply_result = ::Widget::ContextStore.apply(chat, sanitized)
        # Entre mensagens, só mudanças relevantes (produto/identidade) geram registro no
        # histórico: mudança de página a cada navegação não polui a conversa.
        if apply_result && (apply_result.changed_sections & %w[product visitor]).any?
          ::Widget::ContextHistoryWriter.record(chat, apply_result.context)
        end

        render json: { stored: true }
      end

      private

      def render_context_too_large
        render_error(status: :unprocessable_entity, code: "contextTooLarge")
      end

      def throttle_context!
        throttle_endpoint!(scope: "widget:context:visitor", limit: 30, key: @visitor_id)
      end
    end
  end
end
