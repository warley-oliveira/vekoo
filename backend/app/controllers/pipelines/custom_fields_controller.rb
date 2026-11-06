module Pipelines
  class CustomFieldsController < BaseController
    before_action :set_board
    before_action :set_field, only: %i[update destroy]

    def index
      fields = @board.custom_fields.reorder(:scope, :position)

      render json: { customFields: CustomFieldSerializer.many(fields), meta: { total: fields.size } }
    end

    def create
      field = @board.custom_fields.build(field_params)

      if field.save
        render json: CustomFieldSerializer.one(field), status: :created
      else
        render_invalid(field)
      end
    end

    def update
      if @field.update(field_params)
        render json: CustomFieldSerializer.one(@field)
      else
        render_invalid(@field)
      end
    end

    def destroy
      @field.destroy!
      head :no_content
    end

    # { orderedIds: [...] }
    def reorder
      Reorder.call(scope: @board.custom_fields, ordered_ids: ordered_ids, lock_key: @board.id)
      head :no_content
    end

    private

    def set_field
      @field = @board.custom_fields.find(params[:id])
    end

    def field_params
      envelope(:custom_field).permit(
        :name, :field_type, :position, :required, :default_value,
        :scope, :stage_id, :required_to_leave_stage, options: []
      )
    end
  end
end
