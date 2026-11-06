# Os avisos de quem está logado: os do produto (`Notification`, da organização) e os
# dela (`AccountNotice`), juntos e ordenados por `Notifications::Feed`.
#
# O contrato anterior continua igual: `notifications`, `unread`, e `id`/`key`/`at`/`read`
# em cada item. O resto é acréscimo.
class NotificationsController < PlatformController
  # GET /notifications?page=&perPage=&category=&unread=&read=&archived=
  def index
    render_feed(feed_with_filters)
  end

  # GET /notifications/unread-count
  def unread_count
    render json: { unreadCount: feed.unread_count }
  end

  def show
    render json: NotificationSerializer.one(feed.find(params[:id]))
  end

  # POST /notifications/:id/read
  def read
    record = feed.find(params[:id])
    record.mark_as_read!
    NotificationsChannel.broadcast_unread(current_account)

    render json: NotificationSerializer.one(record)
  end

  # POST /notifications/read-all
  def read_all
    feed.read_all!
    NotificationsChannel.broadcast_unread(current_account)

    render_feed(feed)
  end

  # Aviso da pessoa vai para os arquivados; aviso do produto sai da organização inteira,
  # como o "lido" dele, que também é de todos.
  def destroy
    feed.find(params[:id]).dismiss!
    NotificationsChannel.broadcast_unread(current_account)

    head :no_content
  end

  private

  def feed
    @feed ||= Notifications::Feed.new(current_account)
  end

  def feed_with_filters
    Notifications::Feed.new(current_account, params.permit(:category, :unread, :read, :archived).to_h.symbolize_keys)
  end

  def render_feed(source)
    records, meta = source.page(page: params[:page], per_page: params[:per_page])

    render json: { notifications: NotificationSerializer.many(records), unread: source.unread_count, meta: meta }
  end
end
