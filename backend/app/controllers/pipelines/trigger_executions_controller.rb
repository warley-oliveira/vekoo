module Pipelines
  class TriggerExecutionsController < BaseController
    DEFAULT_PER_PAGE = 50

    before_action :set_board

    def index
      executions = TriggerExecution.for_board(@board.id).recent.includes(:trigger, :card)

      unless visibility_for(@board).unrestricted?
        executions = executions.where(card_id: visible_cards.unscope(:order).select(:id))
      end

      # Filtrar na tela só alcançaria a página carregada: "só as falhas" esconderia as mais antigas.
      executions = executions.where(status: params[:status]) if TriggerExecution::STATUSES.include?(params[:status])
      executions = executions.where(pipeline_trigger_id: params[:trigger_id]) if params[:trigger_id].present?

      records, meta = paginate(executions, per_page: DEFAULT_PER_PAGE)

      render json: { executions: records.map { |execution| TriggerSerializer.execution(execution) }, meta: meta }
    end
  end
end
