module FlowRuntime
  module Nodes
    # Move o card para outra etapa do mesmo quadro (respeita checklist e campos obrigatórios da etapa).
    class PipelineMoveCard < PipelineBase
      protected

      def perform
        with_card { |id| gateway.call(:move_card, id, text("stage_id"), data["position"] == "bottom") }
      end
    end
  end
end
