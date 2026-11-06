module FlowRuntime
  module Nodes
    # Cria um card no quadro e etapa escolhidos, ligado à conversa. O card fica registrado para este bloco (CardRefs), e os
    # seguintes podem agir sobre ele. Ao rodar de novo na mesma conversa, reaproveita o card ainda em aberto em vez de
    # duplicar (desligável com `reuse_existing: false`).
    class PipelineCreateCard < KanbanBase
      protected

      def perform
        if (existing = reusable_card_id)
          return continue(default_next_node_id, variables: { "pipeline_card_id" => existing }, log: { input: data, output: { reused_card_id: existing } })
        end

        result = gateway.call(:create_card, data["board_id"], data["stage_id"], card_attributes)
        return failed(result) unless result[:ok]

        card_id = result[:data][:id]
        card_refs.remember(node_id, card_id)
        finish(result, variables: { "pipeline_card_id" => card_id })
      end

      private

      def card_attributes
        {
          "title" => text("title"),
          "description" => text("description"),
          "priority" => data["priority"].presence,
          "deal_value" => text("deal_value"),
          "linkChat" => data["link_chat"] != false
        }.compact
      end

      def reusable_card_id
        return nil if data["reuse_existing"] == false

        card_id = card_refs.fetch(node_id)
        return nil if card_id.blank?

        ::Pipelines::Card.active
                         .joins(stage: :board)
                         .where(pipeline_boards: { organization_id: organization.id })
                         .where(id: card_id, won_at: nil, lost_at: nil)
                         .pick(:id)
      end
    end
  end
end
