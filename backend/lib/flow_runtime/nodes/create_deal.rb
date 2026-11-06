module FlowRuntime
  module Nodes
    # Bloco antigo, ainda oferecido pelos modelos de fluxo: cria o card direto. Não trava o fluxo por configuração ruim:
    # registra e segue, e a pessoa corrige no editor.
    class CreateDeal < KanbanBase
      protected

      def perform
        stage_id = resolve_stage_id
        return continue(default_next_node_id, log: skipped_log("invalid_or_missing_stage")) if stage_id.nil?

        card = ::Pipelines::Card.create!(card_attributes(stage_id))
        continue(default_next_node_id, variables: { "last_deal_id" => card.id }, log: { input: data, output: { card_id: card.id, title: card.title } })
      rescue StandardError => e
        Rails.logger.warn("[CreateDeal] falhou: #{e.message}")
        continue(default_next_node_id, log: skipped_log("error: #{e.message}"))
      end

      private

      def card_attributes(stage_id)
        {
          stage_id: stage_id,
          title: interpolate(data["title"].to_s).presence || default_title,
          description: interpolate(data["description"].to_s),
          deal_value: numeric(data["deal_value"]),
          deal_probability: numeric(data["deal_probability"]),
          assigned_to_id: own_account(data["assigned_to_id"])&.id,
          chat_id: chat&.id&.to_s
        }.compact
      end

      # A etapa precisa ser de um quadro desta organização.
      def resolve_stage_id
        return nil if data["stage_id"].blank?

        ::Pipelines::Stage.joins(:board).where(pipeline_boards: { organization_id: organization.id }).where(id: data["stage_id"]).pick(:id)
      end

      def numeric(value)
        return value if value.is_a?(Numeric)
        return nil if value.blank?

        Float(value.to_s, exception: false)
      end

      def skipped_log(reason)
        { input: data, output: { skipped: reason } }
      end

      def default_title
        return I18n.t("automation.flows.defaults.new_deal") unless context.contact

        I18n.t("automation.flows.defaults.deal_of", name: context.contact.name || context.contact.id)
      end
    end
  end
end
