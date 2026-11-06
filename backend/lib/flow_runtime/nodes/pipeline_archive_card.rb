module FlowRuntime
  module Nodes
    # Arquiva o card.
    class PipelineArchiveCard < KanbanBase
      protected

      def perform
        with_card { |id| gateway.call(:archive_card, id) }
      end
    end
  end
end
