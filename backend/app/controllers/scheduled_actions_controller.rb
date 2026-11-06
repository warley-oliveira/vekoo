# O que a conversa ainda vai enviar sozinha, e o cancelamento de um item.
class ScheduledActionsController < PlatformController
  require_permission :chat

  before_action :set_chat

  def index
    render json: ScheduledAction.payload_for(@chat)
  end

  # O job continua na fila, e chega para encontrar a linha cancelada.
  def destroy
    action = @chat.scheduled_actions.pending.where(id: params[:id]).take
    return render_not_found unless action

    action.update!(status: :canceled, canceled_at: Time.current, canceled_by_account_id: current_account.id)
    ScheduledAction.broadcast_for(@chat)

    head :no_content
  end

  private

  def set_chat
    @chat = Chat.scoped(current_organization.id, params[:chat_id])
    render_not_found unless @chat
  end
end
