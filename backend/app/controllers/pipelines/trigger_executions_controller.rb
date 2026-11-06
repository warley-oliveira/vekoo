module Pipelines
  class TriggerExecutionsController < BaseController
    DEFAULT_PER_PAGE = 50

    before_action :set_board

    def index
      executions = TriggerExecution.for_board(@board.id).recent.includes(:trigger, :card)

      unless visibility_for(@board).unrestricted?
        executions = executions.where(card_id: visible_cards.unscope(:order).select(:id))
      end

      records, meta = paginate(executions, per_page: DEFAULT_PER_PAGE)

      render json: { executions: records.map { |execution| TriggerSerializer.execution(execution) }, meta: meta }
    end
  end
end
