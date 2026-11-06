module FlowRuntime
  module Nodes
    # Roteia pela intenção. Sempre no modelo rápido, sem herdar o prompt base do fluxo.
    class AiIntentClassification < AiBase
      DEFAULT = "default".freeze
      NO_TEXT = "(sem texto)".freeze

      def call
        intents = output_handles.reject { |output| output["id"].to_s == "onError" }
        return leave_by_error("no_intents") if intents.empty?

        ids = intents.map { |output| output["id"].to_s } + [ DEFAULT ]
        verdict = llm.structured(
          system: [ system_prompt.presence || I18n.t("automation.flows.prompts.classify_intent"), intent_lines(intents) ].join("\n\n"),
          prompt: last_user_text.presence || NO_TEXT,
          schema: enum_schema("intent", ids),
          size: "fast"
        )
        match = ids.include?(verdict["intent"].to_s) ? verdict["intent"].to_s : DEFAULT

        continue(next_node_id(handle: match) || error_handle_target || default_next_node_id,
                 variables: { "last_intent" => match },
                 log: { input: { text: last_user_text }, output: { intent: match } })
      rescue *rescued_errors => e
        leave_by_error(e)
      end

      protected

      def inherits_base_prompt?
        false
      end

      private

      def intent_lines(intents)
        lines = intents.map { |output| "- #{output['id']}: #{output['when'].presence || output['label']}" }
        (lines + [ "- #{DEFAULT}: #{I18n.t('automation.flows.prompts.none_of_the_above')}" ]).join("\n")
      end
    end
  end
end
