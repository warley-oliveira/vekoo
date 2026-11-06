module FlowRuntime
  module Nodes
    class Switch < Base
      def call
        field_value = interpolate(data["field"].to_s)
        match = Array(data["cases"]).find { |candidate| candidate["value"].to_s == field_value }

        handle = match ? match["id"] : "default"
        next_id = next_node_id(handle: handle) || default_next_node_id

        continue(next_id, log: { input: { field: data["field"], value: field_value }, output: { matched_case: handle } })
      end
    end
  end
end
