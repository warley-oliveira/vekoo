module FlowRuntime
  module Nodes
    # Marca o negócio como ganho (confere os campos obrigatórios do quadro).
    class PipelineMarkWon < PipelineBase
      protected

      def perform
        with_card { |id| gateway.call(:mark_won, id) }
      end
    end
  end
end
