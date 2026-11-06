module Pipelines
  class ActivitiesController < BaseController
    PER_PAGE = 30

    before_action :set_board
    before_action :set_card

    # ?cursor=<nextCursor>&type=<ação>&limit=<1..100>
    #
    # O filtro é `type`, e não `action` como na origem: `params[:action]` é sempre o nome da ação do
    # controlador, e lá a consulta filtrava por `action = 'index'` e nunca devolvia nada.
    def index
      limit = params.fetch(:limit, PER_PAGE).to_i.clamp(1, 100)

      scope = @card.activities.includes(user: PersonPayload.preload)
      scope = scope.where(action: params[:type].to_s) if params[:type].present?
      cursor = parse_cursor(params[:cursor])
      scope = scope.where("pipeline_card_activities.created_at < ?", cursor) if cursor

      activities = scope.limit(limit + 1).to_a
      has_more = activities.size > limit
      activities = activities.first(limit)

      render json: {
        activities: ActivitySerializer.many(activities),
        hasMore: has_more,
        nextCursor: has_more ? activities.last.created_at.utc.iso8601(6) : nil,
        totalCount: @card.activities.count
      }
    end

    private

    # Cursor que não é data: como se não tivesse vindo.
    def parse_cursor(value)
      value.present? ? Time.iso8601(value.to_s) : nil
    rescue ArgumentError
      nil
    end
  end
end
