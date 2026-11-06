module FlowRuntime
  module Nodes
    class SetVariable < Base
      def call
        assignments = Array(data["assignments"])
        new_variables = assignments.each_with_object({}) do |item, result|
          name = item["name"]
          next if name.blank?

          result[name] = interpolate(item["value"].to_s)
        end

        continue(default_next_node_id, variables: new_variables, log: { input: { assignments: assignments }, output: { variables: new_variables } })
      end
    end
  end
end
