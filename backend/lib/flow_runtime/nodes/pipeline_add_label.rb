module FlowRuntime
  module Nodes
    # Aplica uma etiqueta pelo nome (criada na organização se ainda não existir).
    class PipelineAddLabel < KanbanBase
      protected

      def perform
        label = text("label")
        return failed(ok: false, error: I18n.t("automation.flows.errors.pipelines_no_label")) if label.blank?

        with_card { |id| gateway.call(:add_label, id, label) }
      end
    end
  end
end
