module FlowRuntime
  module Nodes
    # Remove uma etiqueta do card.
    class PipelineRemoveLabel < PipelineBase
      protected

      def perform
        with_card { |id| gateway.call(:remove_label, id, data["label_id"]) }
      end
    end
  end
end
