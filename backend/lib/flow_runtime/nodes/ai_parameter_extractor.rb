module FlowRuntime
  module Nodes
    # Extrai campos da mensagem e guarda em variáveis. Campo não encontrado não apaga o que já havia.
    class AiParameterExtractor < AiBase
      def call
        fields = Array(data["fields"]).select { |field| field["name"].to_s.match?(ExitJudge::PARAM_NAME) }
        return leave_by_error("no_fields") if fields.empty?

        parsed = llm.structured(
          system: [ system_prompt(fallback: I18n.t("automation.flows.prompts.extract_fields")), schema_lines(fields) ].join("\n\n"),
          prompt: last_user_text.presence || AiIntentClassification::NO_TEXT,
          schema: schema_for(fields),
          size: model_size,
          effort: model_size == "fast" ? "low" : "medium"
        )
        found = parsed.compact

        continue(default_next_node_id, variables: found, log: { input: { text: last_user_text }, output: found })
      rescue *rescued_errors => e
        leave_by_error(e)
      end

      private

      def schema_lines(fields)
        fields.map { |field| "- #{field['name']} (#{field['type'] || 'string'}): #{field['description']}" }.join("\n")
      end

      def schema_for(fields)
        {
          "type" => "object",
          "additionalProperties" => false,
          "required" => fields.map { |field| field["name"].to_s },
          "properties" => fields.to_h { |field| [ field["name"].to_s, ExitJudge.nullable_property(field["type"], description: field["description"]) ] }
        }
      end
    end
  end
end
