module FlowRuntime
  module Nodes
    class EndFlow < Base
      def call
        NodeResult.complete(log: { output: { ended: true } })
      end
    end
  end
end
