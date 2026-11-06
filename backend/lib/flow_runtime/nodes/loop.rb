module FlowRuntime
  module Nodes
    # Passa por uma lista. A saída `each` leva ao corpo, cujo último bloco se liga de volta aqui; a saída `done` (ou a
    # padrão) segue quando a lista acaba. Na origem o bloco só guardava a lista e seguia uma vez, sem repetir nada.
    #
    # Cada volta renova o teto de passos da rodada, e o que limita é `MAX_ITERATIONS` e o teto da execução inteira.
    class Loop < Base
      MAX_ITERATIONS = 100

      def call
        state = context.node_state(node_id)
        items = state["items"] || load_items
        index = state["index"].to_i

        return finish(items) if index >= items.length || next_node_id(handle: "each").nil?

        context.update_node_state(node_id, "items" => items, "index" => index + 1)
        continue(
          next_node_id(handle: "each"),
          variables: { loop_variable => items[index], index_variable => index, "#{loop_variable}_count" => items.length },
          fresh_steps: true,
          log: { input: { items_count: items.length }, output: { index: index } }
        )
      end

      private

      def finish(items)
        context.update_node_state(node_id, {})
        continue(next_node_id(handle: "done") || default_next_node_id, log: { input: { items_count: items.length }, output: { done: true } })
      end

      def load_items
        Array(resolve_items).first(max_iterations)
      end

      def max_iterations
        limit = data["max_iterations"].to_i
        limit.positive? ? [ limit, MAX_ITERATIONS ].min : MAX_ITERATIONS
      end

      def loop_variable
        data["loop_variable"].presence || "item"
      end

      def index_variable
        data["index_variable"].presence || "index"
      end

      def resolve_items
        source = data["source"]
        return source if source.is_a?(Array)
        return nil unless source.is_a?(String)

        # `{{vars.lista}}` ou o nome da variável.
        name = source.gsub(/[{}\s]/, "").delete_prefix("vars.")
        ExecutionContext::Templating.dig_value(variables, name.split("."))
      end
    end
  end
end
