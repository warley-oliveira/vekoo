# Paginação única para Active Record e Mongoid.
#
#   records, meta = paginate(scope)
#   render json: { chats: ChatSerializer.many(records), meta: meta }
module Paginated
  extend ActiveSupport::Concern

  DEFAULT_PER_PAGE = 25
  MAX_PER_PAGE = 100

  private

  def paginate(scope, per_page: DEFAULT_PER_PAGE)
    page = [ params[:page].to_i, 1 ].max
    size = (params[:per_page].presence || per_page).to_i.clamp(1, MAX_PER_PAGE)
    total = scope.count

    [
      scope.offset((page - 1) * size).limit(size),
      {
        page: page,
        perPage: size,
        total: total,
        totalPages: (total.to_f / size).ceil,
        hasMore: page * size < total
      }
    ]
  end
end
