module FlowRuntime
  module Nodes
    # Cria um negócio: um card com valor e probabilidade, numa etapa de qualquer quadro da organização, direto, sem passar pelo
    # KanbanGateway. Não trava o fluxo por configuração ruim: registra e segue, e a pessoa corrige no editor.
    class PipelineCreateDeal < PipelineBase
      protected

      def perform
        stage = organization_stage(text("stage_id"))
        return skip("invalid_or_missing_stage") unless stage

        card = ::Pipelines::Card.create!(card_attributes(stage))
        continue(default_next_node_id, variables: { "last_deal_id" => card.id }, log: { input: data, output: { card_id: card.id, stage_id: stage.id, title: card.title } })
      rescue ActiveRecord::RecordInvalid => e
        Rails.logger.warn("[PipelineCreateDeal] #{e.message}")
        skip("error: #{e.message}")
      end

      private

      def card_attributes(stage)
        {
          stage: stage,
          title: text("title") || default_title,
          description: text("description"),
          deal_value: numeric("deal_value"),
          deal_probability: numeric("deal_probability")&.round,
          assigned_to_id: own_account(data["assigned_to_id"])&.id,
          chat_id: chat&.id&.to_s
        }.compact
      end

      def default_title
        return I18n.t("automation.flows.defaults.new_deal") unless context.contact

        I18n.t("automation.flows.defaults.deal_of", name: context.contact.name || context.contact.id)
      end
    end
  end
end
