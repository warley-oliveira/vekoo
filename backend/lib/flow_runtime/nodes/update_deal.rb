module FlowRuntime
  module Nodes
    # Bloco antigo: atualiza o card criado por `create_deal`.
    class UpdateDeal < KanbanBase
      protected

      def perform
        card_id = data["card_id"].presence || variables["last_deal_id"]
        return continue(default_next_node_id, log: { input: data, output: { skipped: "no_card" } }) if card_id.blank?

        card = ::Pipelines::Card.joins(stage: :board).where(pipeline_boards: { organization_id: organization.id }).find_by(id: card_id)
        return continue(default_next_node_id, log: { input: data, output: { skipped: "card_not_found" } }) unless card

        attributes = data.slice("stage_id", "deal_value", "deal_probability", "assigned_to_id").compact
        attributes["title"] = interpolate(data["title"].to_s) if data["title"].present?
        attributes["description"] = interpolate(data["description"].to_s) if data["description"].present?

        card.update!(attributes) if attributes.any?
        continue(default_next_node_id, log: { input: data, output: { card_id: card.id, attributes: attributes } })
      end
    end
  end
end
