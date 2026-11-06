# Mover uma conversa entre as etapas de um funil. A conversa precisa estar ao alcance de quem move
# (`chat_list_to`): fora disso responde 404, como em todo o resto.
class FunnelChatsController < PlatformController
  include InboxAccess

  require_permission :funnel

  before_action :set_funnel
  before_action :set_chat

  rescue_from Funnels::MoveChat::InvalidStage do
    render_error(status: :unprocessable_content, code: "invalidStage", field: "stageId", message: t("insights.funnels.errors.invalid_stage"))
  end

  # PUT /funnels/:funnel_id/chats/:id { stageId }. `null` tira do funil. Sem o campo, 400: mandar o
  # corpo errado não pode tirar a conversa do funil por engano.
  def update
    raise ActionController::ParameterMissing, :stage_id unless params.key?(:stage_id)

    move(params[:stage_id])
  end

  # DELETE /funnels/:funnel_id/chats/:id
  def destroy
    move(nil)
  end

  private

  def move(stage_id)
    result = Funnels::MoveChat.call(chat: @chat, funnel: @funnel, stage_id: stage_id)

    render json: { chat: ChatSerializer.one(result.chat), stageId: result.stage&.id, moved: result.moved? }
  end

  def set_funnel
    @funnel = current_organization.funnels.find(params[:funnel_id])
  end

  def set_chat
    @chat = find_visible_chat(params[:id])
    render_not_found unless @chat
  end
end
