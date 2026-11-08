module FlowRuntime
  module Nodes
    # Um valor, vários caminhos. Compara como a condição: sem maiúscula, acento nem espaço nas pontas.
    class Switch < Base
      def call
        field_value = interpolate(data["field"].to_s)
        wanted = Condition.normalize(field_value)
        match = Array(data["cases"]).find { |candidate| Condition.normalize(interpolate(candidate["value"].to_s)) == wanted }

        handle = match ? match["id"] : "default"
        next_id = next_node_id(handle: handle) || default_next_node_id

        continue(next_id, log: { input: { field: data["field"], value: field_value }, output: { matched_case: handle } })
      end
    end
  end
end
