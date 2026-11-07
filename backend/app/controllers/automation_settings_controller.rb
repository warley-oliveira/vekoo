# Como a automação se comporta nas conversas: o que na origem era configuração de cada
# assistente e aqui é da organização, em `settings` (ver OrganizationRelations::Connectors).
class AutomationSettingsController < PlatformController
  require_permission :core_settings, only: :update

  FIELDS = %i[
    automation_enabled default_automation_enabled automation_pause_period automation_pause_time_to
    business_work_enabled auto_clear_context_enabled auto_clear_context_interval flow_debounce_seconds
  ].freeze

  def show
    render_settings
  end

  def update
    current_organization.update_automation_settings!(submitted)
    render_settings
  end

  private

  def submitted
    values = params.permit(*FIELDS).to_h
    values["business_work"] = params[:business_work].to_unsafe_h if params[:business_work].respond_to?(:to_unsafe_h)
    normalize_debounce(values)
  end

  # A mesma trava de quem lê: fora dela, a tela mostraria um número que não vale. `null` volta ao
  # padrão, e o que não é número não muda nada.
  def normalize_debounce(values)
    return values unless values.key?("flow_debounce_seconds")

    raw = values["flow_debounce_seconds"]
    return values if raw.nil?

    seconds = Integer(raw, exception: false)
    if seconds
      values["flow_debounce_seconds"] = Flows::InboundDispatcher.clamp_debounce(seconds)
    else
      values.delete("flow_debounce_seconds")
    end
    values
  end

  def render_settings
    organization = current_organization

    render json: {
      automationSettings: {
        automationEnabled: organization.automation_enabled?,
        defaultAutomationEnabled: organization.default_automation_enabled,
        automationPausePeriod: organization.automation_pause_period,
        automationPauseTimeTo: organization.automation_pause_time_to,
        businessWorkEnabled: organization.business_work_enabled,
        businessWork: organization.business_work.to_h.deep_transform_keys { |key| key.to_s.camelize(:lower) },
        autoClearContextEnabled: organization.auto_clear_context_enabled,
        autoClearContextInterval: organization.auto_clear_context_interval,
        flowDebounceSeconds: Flows::InboundDispatcher.debounce_seconds(organization),
        timezone: organization.timezone
      }
    }
  end
end
