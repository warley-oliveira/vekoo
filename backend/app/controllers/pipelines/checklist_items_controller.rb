module Pipelines
  class ChecklistItemsController < BaseController
    before_action :set_board
    before_action :set_card
    before_action :set_checklist
    before_action :set_item, only: %i[update destroy toggle]

    def create
      item = @checklist.items.build(item_params)

      if item.save
        render json: ChecklistSerializer.item_json(item), status: :created
      else
        render_invalid(item)
      end
    end

    def update
      if @item.update(item_params)
        render json: ChecklistSerializer.item_json(@item)
      else
        render_invalid(@item)
      end
    end

    def toggle
      @item.toggle!
      render json: ChecklistSerializer.item_json(@item)
    end

    def destroy
      @item.destroy!
      head :no_content
    end

    private

    def set_checklist
      @checklist = @card.checklists.find(params[:checklist_id])
    end

    def set_item
      @item = @checklist.items.find(params[:id])
    end

    def item_params
      envelope(:item).permit(:title, :completed, :position, :assigned_to_id)
    end
  end
end
