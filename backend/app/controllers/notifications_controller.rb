class NotificationsController < AuthenticatedController
  def index
    notifications = current_organization.notifications.recent_first.to_a

    render json: {
      notifications: NotificationSerializer.many(notifications),
      unread: notifications.count { |notification| !notification.read }
    }
  end

  # POST /notifications/read-all
  def read_all
    current_organization.notifications.unread.update_all(read: true, updated_at: Time.current)
    render json: {
      notifications: NotificationSerializer.many(current_organization.notifications.recent_first),
      unread: 0
    }
  end
end
