module FlowRuntime
  module Nodes
    # Marca o negócio como perdido, com motivo opcional.
    class PipelineMarkLost < PipelineBase
      protected

      def perform
        with_card { |id| gateway.call(:mark_lost, id, text("reason")) }
      end
    end
  end
end
