module FlowRuntime
  module Nodes
    # Comenta no card. Quem assina é o fluxo, porque o assistente não existe mais.
    class PipelineAddComment < KanbanBase
      protected

      def perform
        body = text("body")
        return failed(ok: false, error: I18n.t("automation.flows.errors.pipelines_no_comment")) if body.blank?

        with_card { |id| gateway.call(:add_comment, id, body) }
      end
    end
  end
end
