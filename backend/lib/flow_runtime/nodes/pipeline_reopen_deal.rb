module FlowRuntime
  module Nodes
    # Reabre um negócio ganho ou perdido.
    class PipelineReopenDeal < KanbanBase
      protected

      def perform
        with_card { |id| gateway.call(:reopen_deal, id) }
      end
    end
  end
end
