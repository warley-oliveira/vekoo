module FlowRuntime
  module Nodes
    # Classifica o sentimento da última mensagem, no modelo rápido.
    class AiSentiment < AiBase
      DEFAULT_OUTPUTS = %w[positive neutral negative].freeze

      def call
        outputs = output_handles.map { |output| output["id"].to_s }.reject { |id| id == "onError" }.presence || DEFAULT_OUTPUTS

        verdict = llm.structured(
          system: I18n.t("automation.flows.prompts.classify_sentiment"),
          prompt: last_user_text.presence || AiIntentClassification::NO_TEXT,
          schema: enum_schema("sentiment", outputs),
          size: "fast"
        )
        match = outputs.include?(verdict["sentiment"].to_s) ? verdict["sentiment"].to_s : outputs.last

        continue(next_node_id(handle: match) || error_handle_target || default_next_node_id,
                 variables: { "last_sentiment" => match },
                 log: { input: { text: last_user_text }, output: { sentiment: match } })
      rescue *rescued_errors => e
        leave_by_error(e)
      end
    end
  end
end
