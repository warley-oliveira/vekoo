# A conversa de criação (`/brands/:brand_id/conversations`).
#
# É o caminho principal do produto: a pessoa descreve a peça numa frase e o
# agente entrega. O controlador não fala com o modelo — ele confere a marca, o
# saldo e o teto de OPEX, guarda o turno e enfileira; quem pensa é o
# `AgentTurnJob`, e quem avisa é o `AgentChannel`.
#
# O dinheiro é reservado **aqui**, antes da fila, porque "seus créditos
# acabaram" precisa ser um status HTTP de verdade e não um evento que chega
# meio minuto depois. O estorno de quem não recebeu nada é do `Agent::Run`.
class AgentConversationsController < AuthenticatedController
  include PieceErrors

  before_action :set_brand
  before_action :set_conversation, only: %i[show destroy turns]

  def index
    conversations = @brand.agent_conversations.recent_first.limit(50)
    render json: {
      conversations: AgentConversationSerializer.many_summaries(conversations),
      retentionDays: (AgentConversation::RETENTION / 1.day).to_i
    }
  end

  def show
    render json: AgentConversationSerializer.one(@conversation)
  end

  # Abre a conversa **e** manda o primeiro pedido: são um gesto só na tela.
  def create
    return render_brand_not_ready unless ready?

    payload = params.require(:turn)
    conversation = @brand.agent_conversations.new(
      organization: current_organization,
      account: current_account,
      title: AgentConversation.title_from(payload[:prompt])
    )

    turn = nil
    ActiveRecord::Base.transaction do
      conversation.save!
      turn = start_turn(conversation, payload)
    end
    return if performed?

    enqueue(turn)
    render json: AgentConversationSerializer.one(conversation.reload), status: :created
  rescue Organization::NoCreditsError
    render_no_credits
  rescue Agent::Budget::CapReached
    render_cost_cap
  end

  def turns
    return render_brand_not_ready unless ready?

    turn = start_turn(@conversation, params.require(:turn))
    return if performed?

    enqueue(turn)
    render json: AgentTurnSerializer.one(turn), status: :accepted
  rescue Organization::NoCreditsError
    render_no_credits
  rescue Agent::Budget::CapReached
    render_cost_cap
  end

  def destroy
    @conversation.destroy!
    head :no_content
  end

  private

  def set_brand
    @brand = current_organization.brand_cores.find(params[:brand_id])
  end

  def set_conversation
    @conversation = @brand.agent_conversations.find(params[:id])
  end

  def ready?
    @brand.generation_contract[:ready]
  end

  # Cria o turno depois de conferir tudo o que pode dar errado antes de gastar.
  # Devolve `nil` quando já respondeu (`performed?`).
  def start_turn(conversation, payload)
    kind = AgentTurn::KINDS.include?(payload[:kind].to_s) ? payload[:kind].to_s : "create"
    prompt = payload[:prompt].to_s.strip
    return render_prompt_missing if prompt.blank? && kind != "vary"

    base_piece_id = payload[:basePieceId].presence&.to_s
    return render_base_missing if kind.in?(%w[adjust vary]) && !@brand.pieces.exists?(id: base_piece_id)

    attachments = Array(payload[:attachments]).map(&:to_s).uniq
    if attachments.any? && @brand.assets.where(id: attachments, kind: "photo").count != attachments.length
      return render_attachment_missing
    end

    # Um turno pensando por conversa: dois cliques no botão não devem virar
    # duas chamadas ao modelo.
    return render_busy if conversation.busy?

    Agent::Budget.check!(current_organization)
    cost = cost_for(kind)
    current_organization.reserve_credits!(cost)

    conversation.turns.create!(
      organization: current_organization,
      account: current_account,
      kind: kind,
      prompt: prompt,
      base_piece_id: base_piece_id,
      attachments: attachments,
      credits_charged: cost
    )
  end

  def enqueue(turn)
    AgentTurnJob.perform_later(turn.id)
  end

  def cost_for(kind)
    CatalogSerializer::AI_COSTS.fetch(kind == "adjust" ? :agentAdjust : :agent)
  end

  def render_brand_not_ready
    render_error(
      status: :unprocessable_entity,
      code: "brandNotPublished",
      message: t("pieces.errors.brand_not_published")
    )
  end

  def render_prompt_missing
    render_error(status: :bad_request, code: "parameterMissing", field: "prompt",
      message: t("errors.parameter_missing", param: "prompt"))
  end

  def render_base_missing
    render_error(status: :unprocessable_entity, code: "notFound", field: "basePieceId",
      message: t("errors.not_found"))
  end

  def render_attachment_missing
    render_error(status: :unprocessable_entity, code: "unprocessable", field: "attachments",
      message: t("agent.attachment_unknown"))
  end

  def render_busy
    render_error(status: :conflict, code: "busy", message: t("agent.busy"))
  end

  def render_no_credits
    render_error(status: :unprocessable_entity, code: "noCredits", message: t("credits.no_credits"))
  end

  # O teto é da Vekoo, não do cliente — por isso a mensagem não fala em
  # crédito nem manda comprar nada.
  def render_cost_cap
    Rails.logger.error("agent: teto de custo do mês atingido (org #{current_organization.id})")
    render_error(status: :service_unavailable, code: "costCapReached", message: t("agent.cost_cap"))
  end
end
