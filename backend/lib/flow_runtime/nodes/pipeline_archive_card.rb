module FlowRuntime
  module Nodes
    # Arquiva o card.
    class PipelineArchiveCard < PipelineBase
      protected

      def perform
        with_card { |id| gateway.call(:archive_card, id) }
      end
    end
  end
end
