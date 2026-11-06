module FlowRuntime
  module Nodes
    # O bloco inicial. Só passa adiante: quem decide se dispara é `Flows::Dispatch`.
    class Trigger < Base
      def call
        continue(default_next_node_id, log: { input: {}, output: { trigger: node["type"] } })
      end
    end
  end
end
