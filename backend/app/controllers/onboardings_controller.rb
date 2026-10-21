# O onboarding por conversa de uma marca (`/brands/:brand_id/onboarding`).
#
# A pessoa conta da marca e o agente monta o brandcore por baixo. Cada fala
# dela é um `AgentTurn` numa `AgentConversation` de propósito `onboarding` —
# a mesma infra da criação de peças: o controlador confere e enfileira, o
# `AgentTurnJob` pensa (`Onboarding::Run`) e o `AgentChannel` avisa.
#
# O onboarding **não gasta crédito**: só conta no teto de OPEX da Vekoo, e
# quando o teto bate a conversa segue sem o modelo.
class OnboardingsController < AuthenticatedController
  before_action :set_brand

  # GET /brands/:brand_id/onboarding — a conversa e onde a pessoa parou.
  # Sem conversa ainda, `conversationId` vem nulo e a tela mostra a intro.
  def show
    render json: OnboardingSerializer.one(@brand, @brand.onboarding_conversation)
  end

  # POST /brands/:brand_id/onboarding/start — "Começar a conversa".
  # Idempotente: quem clica duas vezes (ou em duas abas) cai na mesma.
  def start
    conversation = @brand.onboarding_conversation
    created = conversation.nil?
    conversation ||= open_conversation
    render json: OnboardingSerializer.one(@brand, conversation), status: created ? :created : :ok
  end

  # POST /brands/:brand_id/onboarding/messages
  #
  # `{ message: { kind, text?, turnId?, index?, assetId? } }`:
  #   - `answer`  a resposta escrita (`text`);
  #   - `suggest` o chip "não sei — cria pra mim";
  #   - `choose`  o clique numa proposta (`turnId` do turno das propostas, `index`);
  #   - `logo`    a logo enviada (`assetId`, já subida por `/assets`).
  def messages
    conversation = @brand.onboarding_conversation || open_conversation
    payload = params.require(:message)
    kind = payload[:kind].to_s
    return render_unknown_kind unless AgentTurn::ONBOARDING_KINDS.include?(kind)
    return render_busy if conversation.busy?

    plan = { "topic" => @brand.onboarding_topic }
    prompt = nil
    case kind
    when "answer"
      prompt = payload[:text].to_s.strip
      return render_text_missing if prompt.blank?
    when "suggest"
      suggest_kind = Onboarding::Run.suggest_kind(plan["topic"])
      return render_unknown_kind unless suggest_kind

      plan["suggestKind"] = suggest_kind
    when "choose"
      choice = choice_from(conversation, payload)
      return render_choice_missing unless choice

      plan.merge!(choice)
    when "logo"
      asset = @brand.assets.find_by(id: payload[:assetId].to_s, kind: "logo")
      return render_asset_missing unless asset

      plan["assetId"] = asset.id
    end

    turn = conversation.turns.create!(
      organization: current_organization, account: current_account,
      kind: kind, prompt: prompt.to_s, plan: plan, status: "thinking",
      attachments: plan["assetId"] ? [ plan["assetId"] ] : []
    )
    AgentTurnJob.perform_later(turn.id)

    render json: OnboardingSerializer.one(@brand.reload, conversation.reload), status: :accepted
  end

  # POST /brands/:brand_id/onboarding/retry — "o motor não respondeu":
  # o mesmo turno, com a mesma resposta, de volta para a fila.
  def retry_turn
    conversation = @brand.onboarding_conversation
    turn = conversation&.turns&.find_by(id: params[:turnId].to_s)
    return render_turn_missing unless turn&.failed? && turn == conversation.turns.last
    return render_busy if conversation.busy?

    turn.update!(status: "thinking", error: nil)
    AgentTurnJob.perform_later(turn.id)
    render json: OnboardingSerializer.one(@brand, conversation.reload), status: :accepted
  end

  # POST /brands/:brand_id/onboarding/wordmark — desenha (ou redesenha) o
  # logotipo tipográfico com a fonte e as cores já escolhidas. É o mesmo
  # libvips das peças: determinístico.
  def wordmark
    assets = RenderWordmark.attach!(@brand, account: current_account)
    return render_wordmark_failed if assets.empty?

    broadcast("assetsChanged")
    render json: { assets: BrandAssetSerializer.many(assets) }, status: :created
  end

  # POST /brands/:brand_id/onboarding/finish — "Publicar brandcore": a
  # versão 1, pelo mesmo `PublishBrandCore` de sempre.
  def finish
    return render_cannot_finish unless @brand.onboarding_ready_to_finish?

    fill_missing_voice!
    ensure_wordmark!
    result = PublishBrandCore.new(@brand, account: current_account).call
    return render_cannot_finish unless result.success?

    @brand.track_onboarding(done: true)
    @brand.save!
    record("finished")
    broadcast("published")

    render json: BrandCoreSerializer.one(@brand.reload)
  end

  private

  def set_brand
    @brand = current_organization.brand_cores.find(params[:brand_id])
  end

  def open_conversation
    @brand.agent_conversations.create!(
      organization: current_organization, account: current_account,
      purpose: "onboarding", title: "onboarding"
    )
  rescue ActiveRecord::RecordNotUnique
    # A outra aba chegou primeiro: a conversa é a dela.
    @brand.onboarding_conversation
  end

  # A proposta escolhida, copiada para o turno da escolha: a tela desenha a
  # fala da pessoa com ela, e o turno das propostas pode até sumir depois.
  def choice_from(conversation, payload)
    source = conversation.turns.find_by(id: payload[:turnId].to_s)
    options = source&.reply&.find { |item| item["type"] == "options" }
    return nil unless options

    index = Integer(payload[:index].to_s, exception: false)
    option = index && index >= 0 ? Array(options["items"])[index] : nil
    return nil unless option

    { "sourceTurnId" => source.id, "choice" => { "kind" => options["kind"], "index" => index, "option" => option } }
  end

  # A voz que a pessoa não soube dizer. Não é invenção escondida: o resumo
  # mostra o tom antes de publicar, e ela pode trocar ali mesmo.
  def fill_missing_voice!
    voice = @brand.full_document["voice"]
    return if voice["essence"].present? && voice["tones"].any?

    proposal = Onboarding::Fallbacks.voices(voice["tones"]).first
    @brand.assign_section("voice", voice.merge(
      "essence" => voice["essence"].presence || proposal["essence"],
      "tones" => voice["tones"].presence || proposal["tones"]
    ))
    @brand.save!
  end

  # Rede de segurança: quem pediu o logotipo e chegou ao fim sem ele (fechou a
  # aba na hora errada) sai daqui com ele mesmo assim.
  def ensure_wordmark!
    return unless @brand.wants_wordmark?
    return if @brand.assets.exists?(kind: "logo")

    RenderWordmark.attach!(@brand, account: current_account)
  end

  def record(action)
    OnboardingEvent.create!(
      organization: current_organization, brand_core: @brand, account: current_account,
      step: BrandCore::Onboarding::SUMMARY, action: action
    )
  rescue StandardError => e
    # Telemetria não derruba cadastro.
    Rails.logger.warn("onboarding_event: #{e.class}: #{e.message[0, 120]}")
  end

  def broadcast(event = "updated")
    BrandCoreChannel.broadcast_to(
      current_organization,
      BrandCoreSerializer.event(@brand.reload, event: event, account: current_account,
        client_id: request.headers["X-Client-Id"])
    )
  end

  def render_unknown_kind
    render_error(status: :unprocessable_entity, code: "unprocessable", field: "kind",
      message: t("onboarding.unknown_kind"))
  end

  def render_text_missing
    render_error(status: :bad_request, code: "parameterMissing", field: "text",
      message: t("errors.parameter_missing", param: "text"))
  end

  def render_choice_missing
    render_error(status: :unprocessable_entity, code: "notFound", field: "index",
      message: t("errors.not_found"))
  end

  def render_asset_missing
    render_error(status: :unprocessable_entity, code: "notFound", field: "assetId",
      message: t("errors.not_found"))
  end

  def render_turn_missing
    render_error(status: :unprocessable_entity, code: "notFound", field: "turnId",
      message: t("errors.not_found"))
  end

  def render_busy
    render_error(status: :conflict, code: "busy", message: t("agent.busy"))
  end

  def render_cannot_finish
    unmet = @brand.completeness.required.reject { |item| item["met"] }.map { |item| item["key"] }
    render_error(status: :unprocessable_entity, code: "brandIncomplete",
      message: t("onboarding.cannot_finish"), details: { "required" => unmet })
  end

  def render_wordmark_failed
    render_error(status: :unprocessable_entity, code: "unprocessable", field: "name",
      message: t("onboarding.wordmark_failed"))
  end
end
