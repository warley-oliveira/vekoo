module FlowRuntime
  module Nodes
    # Atualiza o negócio de `card_id`, ou o último que `pipeline_create_deal` criou nesta execução. Como ele, não trava o fluxo.
    # Mudar de etapa não confere as travas, como na origem, mas passa por `Pipelines::MoveCard`, que acerta as posições.
    class PipelineUpdateDeal < PipelineBase
      protected

      def perform
        card_id = text("card_id") || variables["last_deal_id"]
        return skip("no_card") if card_id.blank?

        card = ::Pipelines::Card.find_by(organization_id: organization.id, id: card_id)
        return skip("card_not_found") unless card

        stage = organization_stage(text("stage_id"))
        return skip("invalid_stage") if data["stage_id"].present? && stage.nil?

        attributes = card_attributes
        card.update!(attributes) if attributes.any?
        ::Pipelines::MoveCard.call(card: card, stage: stage, enforce_gates: false) if stage

        continue(default_next_node_id, log: { input: data, output: { card_id: card.id, attributes: attributes, stage_id: stage&.id }.compact })
      rescue ActiveRecord::RecordInvalid => e
        Rails.logger.warn("[PipelineUpdateDeal] #{e.message}")
        skip("error: #{e.message}")
      end

      private

      def card_attributes
        {
          title: text("title"),
          description: text("description"),
          deal_value: numeric("deal_value"),
          deal_probability: numeric("deal_probability")&.round,
          assigned_to_id: own_account(data["assigned_to_id"])&.id
        }.compact
      end
    end
  end
end
