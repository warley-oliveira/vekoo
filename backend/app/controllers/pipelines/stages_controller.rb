module Pipelines
  class StagesController < BaseController
    before_action :set_board
    before_action :require_full_card_access!, only: :destroy
    before_action :set_stage, only: %i[update destroy]

    def create
      stage = @board.stages.build(stage_params)

      if stage.save
        render json: StageSerializer.one(stage), status: :created
      else
        render_invalid(stage)
      end
    end

    def update
      if @stage.update(stage_params)
        render json: StageSerializer.one(@stage)
      else
        render_invalid(@stage)
      end
    end

    def destroy
      @stage.destroy!
      head :no_content
    end

    # { orderedIds: [...] }
    def reorder
      Reorder.call(scope: @board.stages, ordered_ids: ordered_ids, lock_key: @board.id)

      PipelineBoardChannel.broadcast_board_event(
        @board, event: "stages_reordered", data: { orderedIds: @board.stages.reload.map(&:id) }
      )
      head :no_content
    end

    private

    def set_stage
      @stage = @board.stages.find(params[:id])
    end

    def stage_params
      envelope(:stage).permit(:name, :position, :color, :wip_limit, :sla_hours)
    end
  end
end
