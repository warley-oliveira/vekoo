module FlowRuntime
  module Nodes
    # Cria (ou reaproveita, pelo nome) um checklist no card e adiciona os itens.
    class PipelineAddChecklist < KanbanBase
      protected

      def perform
        name = text("name")
        return failed(ok: false, error: I18n.t("automation.flows.errors.pipelines_no_checklist")) if name.blank?

        with_card do |id|
          result = gateway.call(:add_checklist, id, name)
          next result unless result[:ok]

          items.each do |title|
            item = gateway.call(:add_checklist_item, result[:data][:id], title)
            break result = item unless item[:ok]
          end
          result
        end
      end

      private

      def items
        Array(data["items"]).map { |item| interpolate(item.to_s).strip }.reject(&:blank?)
      end
    end
  end
end
