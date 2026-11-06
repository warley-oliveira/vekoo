# Mensagens rápidas. Quem atende lê, porque o composer do chat oferece a lista. Criar,
# editar e apagar é de quem configura: o texto vale para a organização inteira.
class QuickRepliesController < PlatformController
  include InboxAccess

  require_any_permission :chat, :core_settings, only: %i[index show]
  require_permission :core_settings, except: %i[index show]

  before_action :set_quick_reply, only: %i[show update destroy]

  def index
    records, meta = paginate(filtered_replies.order(:name, :id), per_page: Paginated::MAX_PER_PAGE)

    render json: { quickReplies: QuickReplySerializer.many(records), meta: meta }
  end

  def show
    render json: { quickReply: QuickReplySerializer.one(@quick_reply) }
  end

  def create
    quick_reply = current_organization.quick_replies.new(quick_reply_params)

    if quick_reply.save
      render json: { quickReply: QuickReplySerializer.one(quick_reply) }, status: :created
    else
      render_invalid(quick_reply)
    end
  end

  def update
    if @quick_reply.update(quick_reply_params)
      render json: { quickReply: QuickReplySerializer.one(@quick_reply) }
    else
      render_invalid(@quick_reply)
    end
  end

  def destroy
    @quick_reply.destroy!
    head :no_content
  end

  private

  def set_quick_reply
    @quick_reply = current_organization.quick_replies.find(params[:id])
  end

  def filtered_replies
    replies = current_organization.quick_replies
    return replies if params[:q].blank?

    pattern = "%#{QuickReply.sanitize_sql_like(params[:q].to_s.strip)}%"
    replies.where("quick_replies.name ILIKE :pattern OR quick_replies.trigger ILIKE :pattern OR quick_replies.content ILIKE :pattern", pattern: pattern)
  end

  def quick_reply_params
    params.expect(quick_reply: %i[name trigger content])
  end
end
