module Pipelines
  # O checklist da etapa: o que precisa estar marcado para o card avançar.
  class StageChecklistItemsController < BaseController
    before_action :set_board
    before_action :set_stage
    before_action :set_item, only: %i[update destroy]

    def index
      render json: { items: StageChecklistItemSerializer.many(@stage.checklist_items), meta: { total: @stage.checklist_items.size } }
    end

    def create
      item = @stage.checklist_items.build(item_params)

      if item.save
        render json: StageChecklistItemSerializer.one(item), status: :created
      else
        render_invalid(item)
      end
    end

    def update
      if @item.update(item_params)
        render json: StageChecklistItemSerializer.one(@item)
      else
        render_invalid(@item)
      end
    end

    def destroy
      @item.destroy!
      head :no_content
    end

    # { orderedIds: [...] }
    def reorder
      Reorder.call(scope: @stage.checklist_items, ordered_ids: ordered_ids, lock_key: @stage.id)
      head :no_content
    end

    private

    def set_stage
      @stage = @board.stages.find(params[:stage_id])
    end

    def set_item
      @item = @stage.checklist_items.find(params[:id])
    end

    def item_params
      envelope(:item).permit(:title, :position, :required)
    end
  end
end
