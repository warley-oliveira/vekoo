module FlowRuntime
  # Qual card cada bloco "Criar card" produziu. Os blocos seguintes escolhem de qual criação herdar o card (pode haver
  # vários, em quadros diferentes). Vive em dois lugares:
  #
  #   - `execution.context['pipeline_cards']`: vale na execução atual;
  #   - `Chat#flow_data[flow_id]['_cards']`: persiste entre execuções, para que o fluxo, ao rodar de novo na conversa,
  #     continue no mesmo card.
  class CardRefs
    NODE_ID_FORMAT = /\A[\w-]{1,120}\z/

    def initialize(context)
      @context = context
    end

    def fetch(node_id)
      node_id = node_id.to_s
      execution_refs[node_id].presence || stored_refs[node_id].presence
    end

    def remember(node_id, card_id)
      node_id = node_id.to_s
      return unless NODE_ID_FORMAT.match?(node_id)

      context.update_execution_context("pipeline_cards" => execution_refs.merge(node_id => card_id))
      persist(node_id, card_id)
    end

    private

    attr_reader :context

    def execution
      context.execution
    end

    def execution_refs
      execution.context["pipeline_cards"] || {}
    end

    def stored_refs
      context.chat&.flow_data.to_h.dig(execution.flow_id.to_s, "_cards").to_h
    end

    # `$set` atômico por bloco, escopado pela organização (sem busca só por id).
    def persist(node_id, card_id)
      return if execution.chat_id.blank?

      Chat.where(organization_id: execution.organization_id.to_s, id: execution.chat_id)
          .update_all("$set" => { "flow_data.#{execution.flow_id}._cards.#{node_id}" => card_id })
    end
  end
end
