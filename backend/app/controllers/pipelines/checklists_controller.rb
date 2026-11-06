module Pipelines
  class ChecklistsController < BaseController
    before_action :set_board
    before_action :set_card
    before_action :set_checklist, only: %i[update destroy]

    def index
      checklists = @card.checklists.includes(:items)

      render json: { checklists: ChecklistSerializer.many(checklists), meta: { total: checklists.size } }
    end

    def create
      checklist = @card.checklists.build(checklist_params)

      if checklist.save
        render json: ChecklistSerializer.one(checklist), status: :created
      else
        render_invalid(checklist)
      end
    end

    def update
      if @checklist.update(checklist_params)
        render json: ChecklistSerializer.one(@checklist)
      else
        render_invalid(@checklist)
      end
    end

    def destroy
      @checklist.destroy!
      head :no_content
    end

    private

    def set_checklist
      @checklist = @card.checklists.find(params[:id])
    end

    def checklist_params
      envelope(:checklist).permit(:name, :position)
    end
  end
end
