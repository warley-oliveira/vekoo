module FlowRuntime
  module Nodes
    # Preenche um campo personalizado do quadro (resolve nome, chave e opções de seleção).
    class PipelineSetCustomField < PipelineBase
      protected

      def perform
        key = data["field_key"].to_s
        return failed(ok: false, error: I18n.t("automation.flows.errors.pipelines_no_field")) if key.blank?

        with_card { |id| gateway.call(:assign_custom_field, id, key, text("value")) }
      end
    end
  end
end
