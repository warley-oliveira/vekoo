# O onboarding guiado de uma marca (`/brands/:brand_id/onboarding`).
#
# Uma pergunta por vez, em linguagem de dono de negócio. Cada resposta escreve
# numa seção do mesmo documento que o wizard de edição já conhece — não existe
# um "brandcore do onboarding". O que muda é a porta.
#
# Três verbos e nada mais: `PATCH` responde/pula/registra a visita,
# `suggest` é o "cria pra mim", `finish` publica a versão 1. A telemetria do
# funil sai daqui, e não do cliente: o servidor é quem sabe se a resposta
# entrou.
class OnboardingsController < AuthenticatedController
  before_action :set_brand

  # PATCH /brands/:brand_id/onboarding
  #
  # `{ onboarding: { step, action, segment, document: { <seção>: {...} } } }`
  def update
    payload = params.require(:onboarding)
    step = payload[:step].to_s
    return render_unknown_step unless BrandCore::Onboarding.valid?(step)

    action = %w[viewed answered skipped].include?(payload[:action].to_s) ? payload[:action].to_s : "viewed"
    errors = assign_sections(payload[:document])
    return render_document_invalid(errors) if errors.any?

    @brand.track_onboarding(
      step: step, action: action, segment: payload[:segment].presence,
      wants_wordmark: boolean(payload[:wantsWordmark])
    )
    @brand.save!
    record(step, action)
    broadcast

    render json: BrandCoreSerializer.one(@brand)
  end

  # POST /brands/:brand_id/onboarding/suggest — o "não sei / cria pra mim".
  #
  # Nunca falha por falta de modelo: sem chave, sem rede ou com resposta
  # torta, entram as propostas curadas. Quem está do outro lado já disse que
  # não sabe responder — mandá-la tentar de novo seria a pior resposta
  # possível.
  def suggest
    kind = params.require(:kind).to_s
    return render_unknown_kind unless Onboarding::Suggest::KINDS.include?(kind)

    Agent::Budget.check!(current_organization)
    result = Onboarding::Suggest.call(@brand, kind: kind)
    record(step_for(kind), "suggested", payload: { "kind" => kind, "source" => result.source }, result: result)

    render json: {
      kind: result.kind,
      source: result.source,
      options: result.options,
      costMicroUsd: result.cost_micro_usd
    }
  rescue Agent::Budget::CapReached
    # O teto é da Vekoo, não da pessoa: ela recebe as propostas curadas e não
    # fica sabendo que houve um limite.
    result = Onboarding::Suggest.curated(@brand, kind: kind)
    render json: { kind: kind, source: result.source, options: result.options, costMicroUsd: 0 }
  end

  # POST /brands/:brand_id/onboarding/wordmark — "não tenho logo".
  #
  # Desenha o logotipo tipográfico com a fonte e as cores já escolhidas. É o
  # mesmo libvips das peças: determinístico, e regerável quando a tipografia
  # mudar.
  def wordmark
    assets = RenderWordmark.attach!(@brand, account: current_account)
    return render_wordmark_failed if assets.empty?

    broadcast("assetsChanged")
    render json: { assets: BrandAssetSerializer.many(assets) }, status: :created
  end

  # POST /brands/:brand_id/onboarding/finish — publica a versão 1.
  def finish
    return render_cannot_finish unless @brand.onboarding_ready_to_finish?

    fill_missing_voice!
    ensure_wordmark!
    result = PublishBrandCore.new(@brand, account: current_account).call
    return render_cannot_finish unless result.success?

    @brand.track_onboarding(step: "done", action: "answered", done: true)
    @brand.save!
    record("done", "finished")
    broadcast("published")

    render json: BrandCoreSerializer.one(@brand.reload)
  end

  private

  def set_brand
    @brand = current_organization.brand_cores.find(params[:brand_id])
  end

  # Cada seção entra inteira e passa pela normalização do schema — o mesmo
  # caminho do `PATCH /brands/:id`, e é isso que protege o jsonb.
  def assign_sections(document)
    return [] if document.blank?

    document.to_unsafe_h.each_with_object([]) do |(section, raw), errors|
      next unless BrandCore::Schema::SECTIONS.include?(section.to_s)

      errors.concat(@brand.assign_section(section.to_s, raw))
    end
  end

  # A voz que a pessoa pulou. Não é invenção escondida: o fechamento mostra o
  # cartão da marca inteiro — com esta frase — antes de publicar, e ela pode
  # trocar no modo de edição.
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

  def boolean(value)
    return nil if value.nil?

    ActiveModel::Type::Boolean.new.cast(value)
  end

  def step_for(kind)
    { "palette" => "colors", "fonts" => "fonts", "voice" => "voice" }.fetch(kind, "colors")
  end

  def record(step, action, payload: {}, result: nil)
    OnboardingEvent.create!(
      organization: current_organization, brand_core: @brand, account: current_account,
      step: step, action: action, payload: payload,
      model: result&.model, usage: result&.usage || {},
      cost_micro_usd: result&.cost_micro_usd.to_i
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

  def render_unknown_step
    render_error(status: :unprocessable_entity, code: "unprocessable", field: "step",
      message: t("onboarding.unknown_step"))
  end

  def render_unknown_kind
    render_error(status: :unprocessable_entity, code: "unprocessable", field: "kind",
      message: t("onboarding.unknown_kind"))
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

  def render_document_invalid(errors)
    details = errors.each_with_object({}) do |(path, code), map|
      (map[path] ||= []) << t("errors.messages.#{code}")
    end
    render_error(status: :unprocessable_entity, code: "unprocessable",
      field: details.keys.first, message: t("brand_core.invalid"), details: details)
  end
end
