module FlowRuntime
  module Nodes
    # Atualiza campos do card: só os preenchidos no bloco são enviados.
    class PipelineUpdateCard < KanbanBase
      FIELDS = %w[title description priority deal_value deal_probability company_name
                  contact_email contact_phone due_date expected_close_date].freeze

      protected

      def perform
        attributes = FIELDS.each_with_object({}) do |field, result|
          value = data[field].is_a?(String) ? text(field) : data[field]
          result[field] = value unless value.nil?
        end

        with_card { |id| gateway.call(:update_card, id, attributes) }
      end
    end
  end
end
