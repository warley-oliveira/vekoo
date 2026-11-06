module Pipelines
  # O checklist da etapa visto de um card: o que falta marcar para ele avançar.
  class CardStageChecksController < BaseController
    before_action :set_board
    before_action :set_card

    def index
      items = @card.stage.checklist_items.to_a
      checks = @card.stage_checks.where(pipeline_stage_checklist_item_id: items.map(&:id)).index_by(&:pipeline_stage_checklist_item_id)

      render json: {
        checks: items.map { |item| StageChecklistItemSerializer.check(item, checks[item.id]) },
        meta: { total: items.size }
      }
    end

    # Só item deste quadro. Na origem, `find(params[:id])` sem escopo deixava marcar item de qualquer
    # organização.
    def toggle
      item = StageChecklistItem.where(stage_id: @board.stages.unscope(:order).select(:id)).find(params[:id])
      check = @card.stage_checks.find_or_initialize_by(pipeline_stage_checklist_item_id: item.id)

      if check.new_record?
        check.update!(completed: true, completed_at: Time.current, completed_by_id: current_account.id)
      else
        check.toggle!(current_account)
      end

      @card.broadcast_progress_change

      render json: {
        checklistItemId: item.id,
        completed: check.completed,
        completedAt: ApplicationSerializer.epoch_ms(check.completed_at),
        completedById: check.completed_by_id
      }
    end
  end
end
