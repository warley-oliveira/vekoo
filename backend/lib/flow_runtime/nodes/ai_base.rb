module FlowRuntime
  module Nodes
    # Base dos blocos de IA. Crédito sem saldo e falha do modelo seguem pela saída `onError`, quando ligada.
    class AiBase < Base
      HISTORY_LIMIT = 30
      MESSAGE_LIMIT = 4_000

      protected

      def llm
        @llm ||= Llm.new(organization)
      end

      def model_size
        Llm.size_of(data["model_size"])
      end

      # Prompt enviado ao modelo: o prompt base do fluxo (quando o bloco herda) seguido das instruções do próprio bloco,
      # ou do `fallback` quando o bloco não tem instruções.
      def system_prompt(fallback: nil)
        own = interpolate(data["system_prompt"].to_s).presence || fallback
        [ inherited_base_prompt, own ].compact_blank.join("\n\n")
      end

      # O prompt base vale para todo bloco de IA no modelo principal. O rápido não herda.
      def inherits_base_prompt?
        model_size != "fast"
      end

      def inherited_base_prompt
        return nil unless inherits_base_prompt?

        interpolate(context.flow_version&.base_prompt.to_s).presence
      end

      # As últimas mensagens, de trás para frente pelo índice `{chat_id, created_at}`, sem ler o histórico inteiro.
      def chat_messages(limit: HISTORY_LIMIT)
        return [] unless chat

        ChatMessage::Base.where(chat_id: chat.id, :role.in => %w[user assistant])
                         .order_by(created_at: :desc)
                         .limit(limit)
                         .to_a
                         .reverse
                         .map { |message| { role: message.role, content: Chats::MessageText.for(message, limit: MESSAGE_LIMIT) } }
      end

      def last_user_text
        return context.last_message.content if context.last_message
        return "" unless chat

        chat.last_message_content.to_s
      end

      def output_handles
        Array(data["outputs"])
      end

      def error_handle_target
        next_node_id(handle: "onError")
      end

      # A conta em que a execução está parada também precisa saber que ficou sem crédito.
      def alert_no_credits
        return if context.playground?

        OrganizationAlertService.flow_error(
          organization,
          context.flow,
          code: "flow_no_credits",
          message: I18n.t("automation.flows.errors.no_credits_alert", name: context.flow.name)
        )
      end

      def failure_reason(error)
        case error
        when Llm::NoCredits
          alert_no_credits
          I18n.t("automation.flows.errors.no_credits")
        when Ai::Chat::MissingKey
          I18n.t("automation.flows.errors.ai_unavailable")
        else
          I18n.t("automation.flows.errors.ai_failed", reason: error.message.truncate(300))
        end
      end

      # Saída `onError` se ligada; senão a saída padrão, porque esses blocos só classificam e o fluxo consegue seguir.
      def leave_by_error(error)
        reason = error.is_a?(String) ? error : failure_reason(error)
        continue(error_handle_target || default_next_node_id, log: { input: data, output: { error: reason } })
      end

      def rescued_errors
        [ Llm::NoCredits, Ai::Chat::MissingKey, Ai::Chat::Failed ]
      end

      def enum_schema(key, values)
        {
          "type" => "object",
          "additionalProperties" => false,
          "required" => [ key ],
          "properties" => { key => { "type" => "string", "enum" => values } }
        }
      end
    end
  end
end
