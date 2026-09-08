# GET/PATCH /brand-core e POST /brand-core/publish — o Brandcore da
# organização. Recurso singular de propósito: hoje é um por organização, e a
# tela nunca precisa de id para achá-lo.
#
# O PATCH recebe **seções inteiras** (uma etapa do formulário = uma seção) e o
# progresso (etapas visitadas, última aberta). É o salvamento automático do
# rascunho: nada aqui exige o documento completo — isso é papel de `publish`.
class BrandCoresController < AuthenticatedController
  before_action :set_brand_core

  def show
    render json: BrandCoreSerializer.one(@brand_core)
  end

  def update
    payload = params.require(:brandCore)
    errors = assign_sections(payload[:document])
    return render_document_invalid(errors) if errors.any?

    if payload[:progress].present?
      progress = payload[:progress]
      @brand_core.track_progress(visited: progress[:visitedSteps], last_step: progress[:lastStep])
    end

    @brand_core.save!
    broadcast("updated")
    render json: BrandCoreSerializer.one(@brand_core)
  end

  def publish
    result = PublishBrandCore.new(@brand_core, account: current_account).call

    if result.success?
      broadcast("published") if result.version
      render json: BrandCoreSerializer.one(@brand_core.reload)
    else
      unmet = @brand_core.completeness.required.reject { |item| item["met"] }.map { |item| item["key"] }
      render_error(
        status: :unprocessable_entity,
        code: result.error,
        message: t("brand_core.incomplete"),
        details: { "required" => unmet }
      )
    end
  end

  private

  def set_brand_core
    @brand_core = BrandCore.for(current_organization)
  end

  # Cada seção entra inteira e passa por `BrandCore::Schema.normalize_section`,
  # que só guarda o que a forma conhece — é isso, e não um `permit`, que
  # protege o jsonb de chave estranha.
  def assign_sections(document)
    return [] if document.blank?

    document.to_unsafe_h.each_with_object([]) do |(section, raw), errors|
      next unless BrandCore::Schema::SECTIONS.include?(section.to_s)

      errors.concat(@brand_core.assign_section(section.to_s, raw))
    end
  end

  def render_document_invalid(errors)
    details = errors.each_with_object({}) do |(path, code), map|
      (map[path] ||= []) << t("errors.messages.#{code}")
    end

    render_error(
      status: :unprocessable_entity,
      code: "unprocessable",
      field: details.keys.first,
      message: t("brand_core.invalid"),
      details: details
    )
  end

  # Quem mais estiver com a marca aberta (outra aba, outra pessoa da
  # organização) recebe o aviso e recarrega. `clientId` deixa a própria aba
  # ignorar o eco do que ela mesma acabou de salvar.
  def broadcast(event)
    BrandCoreChannel.broadcast_to(
      current_organization,
      BrandCoreSerializer.event(@brand_core, event: event, account: current_account,
        client_id: request.headers["X-Client-Id"])
    )
  end
end
