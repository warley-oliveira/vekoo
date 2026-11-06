# Campanhas: cadastro, ciclo de vida e monitoramento. Importações em `CampaignImportsController`, e
# o que o assistente de criação oferece em `CampaignOptionsController`.
#
# Corpo solto, sem envelope, como o `useCampaignMutations` da origem manda.
class CampaignsController < PlatformController
  require_permission :campaigns

  # Dados: as chaves são ids de modelo e posições de parâmetro.
  self.opaque_params += %w[template_params]

  before_action :set_campaign, except: %i[index create summary]

  rescue_from Outreach::RefusedError do |error|
    render_error(status: :unprocessable_content, code: error.code, field: error.field, details: error.details)
  end

  def index
    records, meta = paginate(filtered_campaigns.recent)
    render json: { campaigns: Outreach::CampaignSerializer.many(records), meta: meta }
  end

  # Os números do topo da lista, da organização inteira e não só da página.
  def summary
    render json: { summary: Outreach::CampaignSummary.new(current_organization).as_json }
  end

  def show
    render json: { campaign: Outreach::CampaignSerializer.detail(@campaign) }
  end

  def create
    campaign = current_organization.campaigns.new(campaign_attributes.merge(created_by_account_id: current_account.id))
    return unless hydrate_media(campaign)

    scheduled_at = parse_schedule(campaign)
    return if performed?

    schedule(campaign, scheduled_at) if scheduled_at
    return render_invalid(campaign) unless campaign.save

    campaign.log_activity!("created", account_id: current_account.id)
    enqueue_scheduled_launch(campaign) if campaign.scheduled?

    render json: { campaign: Outreach::CampaignSerializer.detail(campaign) }, status: :created
  end

  def update
    return render_error(status: :unprocessable_content, code: "campaignNotEditable") unless @campaign.draft?

    @campaign.assign_attributes(campaign_attributes)
    return unless hydrate_media(@campaign)
    return render_invalid(@campaign) unless @campaign.save

    render json: { campaign: Outreach::CampaignSerializer.detail(@campaign) }
  end

  def destroy
    return render_error(status: :unprocessable_content, code: "campaignNotDeletable") unless @campaign.draft?

    @campaign.destroy
    head :no_content
  end

  def launch
    result = Outreach::LaunchService.new(@campaign, account_id: current_account.id).call

    render json: {
      campaign: Outreach::CampaignSerializer.detail(@campaign),
      warnings: result.warnings,
      estimatedCompletionAt: Outreach::CampaignSerializer.epoch_ms(result.estimated_completion_at)
    }
  end

  def pause
    lifecycle.pause
    render_campaign
  end

  def resume
    lifecycle.resume
    render_campaign
  end

  def cancel
    lifecycle.cancel
    render_campaign
  end

  def stats
    render json: { stats: Outreach::StatsSerializer.detail(@campaign) }
  end

  def recipients
    scope = @campaign.recipients.order_by(_id: 1)
    scope = scope.where(status_cd: params[:status].to_s) if params[:status].present?
    scope = scope.matching(params[:q]) if params[:q].present?

    records, meta = paginate(scope)
    render json: { recipients: Outreach::RecipientSerializer.many(records), meta: meta }
  end

  private

  def set_campaign
    @campaign = Outreach::Campaign.scoped(current_organization.id, params[:id])
    render_not_found unless @campaign
  end

  def lifecycle
    Outreach::Lifecycle.new(@campaign, account_id: current_account.id)
  end

  def render_campaign
    render json: { campaign: Outreach::CampaignSerializer.detail(@campaign) }
  end

  def filtered_campaigns
    scope = current_organization.campaigns
    scope = scope.where(status_cd: params[:status].to_s) if params[:status].present?
    scope = scope.where(name: /#{Regexp.escape(params[:q].to_s)}/i) if params[:q].present?

    if params[:connector_id].present?
      connector_id = params[:connector_id].to_s
      scope = scope.any_of({ connector_ids: connector_id }, { waba_connector_id: connector_id })
    end

    scope
  end

  # A tela fala em janela "09:00" e intervalo; o modelo, em horas e segundos.
  def campaign_attributes
    permitted = params.permit(
      :name, :message_type, :campaign_mode, :attachment_id, :flow_id, :raise_chats,
      :waba_connector_id, :send_window_start, :send_window_end, :interval_min, :interval_max,
      :daily_limit_per_connector, :timezone, :batch_size,
      connector_ids: [], send_days: [], messages: [], chat_tag_ids: [], phone_number_ids: [], template_ids: []
    ).to_h

    attributes = permitted.except(:message_type, :campaign_mode, :send_window_start, :send_window_end, :interval_min, :interval_max)
    attributes[:message_type_cd] = permitted[:message_type] if permitted.key?(:message_type)
    attributes[:campaign_mode_cd] = permitted[:campaign_mode] if permitted.key?(:campaign_mode)
    attributes[:send_start_hour] = hour_of(permitted[:send_window_start]) if permitted.key?(:send_window_start)
    attributes[:send_end_hour] = hour_of(permitted[:send_window_end]) if permitted.key?(:send_window_end)
    attributes[:buffer_min_seconds] = permitted[:interval_min] if permitted.key?(:interval_min)
    attributes[:buffer_max_seconds] = permitted[:interval_max] if permitted.key?(:interval_max)
    attributes[:send_days] = permitted[:send_days].map { |day| Integer(day, exception: false) } if permitted.key?(:send_days)
    attributes[:template_params] = sanitized_template_params if params.key?(:template_params)
    attributes
  end

  def hour_of(value)
    match = value.to_s.match(/\A(\d{1,2}):\d{2}/)
    match && match[1].to_i
  end

  # { id do modelo => { posição => valor } }. As chaves viram nome de campo no Mongo: só passa o que
  # é mesmo um id e uma posição, e os valores só como texto.
  def sanitized_template_params
    raw = params[:template_params]
    raw = raw.to_unsafe_h if raw.respond_to?(:to_unsafe_h)
    return {} unless raw.is_a?(Hash)

    raw.each_with_object({}) do |(template_id, values), result|
      next unless BSON::ObjectId.legal?(template_id.to_s) && values.is_a?(Hash)

      positions = values.select { |position, _| position.to_s.match?(/\A\d{1,3}\z/) }
      result[template_id.to_s] = positions.to_h { |position, value| [ position.to_s, value.to_s ] }
    end
  end

  # Mídia só existe no modo texto, e o que vale é o anexo: URL, tipo e nome vêm dele, nunca de quem
  # chama. Devolve false quando já respondeu com o erro.
  def hydrate_media(campaign)
    return clear_media(campaign) unless campaign.media_message? && campaign.attachment_id.present?

    attachment = Media::AttachmentLookup.find(campaign.attachment_id, organization_id: current_organization.id)
    unless attachment
      render_error(status: :unprocessable_content, code: "mediaNotFound", field: "attachmentId")
      return false
    end

    blob = attachment.file&.blob
    campaign.attachment_id = attachment.id.to_s
    campaign.media_url = attachment.file_url
    campaign.media_content_type = blob&.content_type
    campaign.media_file_name = attachment.name.presence || blob&.filename&.to_s
    true
  end

  def clear_media(campaign)
    campaign.attachment_id = nil
    campaign.media_url = nil
    campaign.media_content_type = nil
    campaign.media_file_name = nil
    true
  end

  # Sem fuso no texto, vale o da campanha: é o relógio que a pessoa está olhando. No passado, a
  # campanha fica em rascunho, como na origem.
  def parse_schedule(campaign)
    raw = params[:scheduled_at]
    return nil if raw.blank?

    time = raw.is_a?(Numeric) ? Time.zone.at(raw / 1000.0) : campaign.time_zone.parse(raw.to_s)
    raise ArgumentError, "data ilegível" if time.nil?

    time if time.future?
  rescue ArgumentError
    render_error(status: :unprocessable_content, code: "invalidScheduledAt", field: "scheduledAt")
    nil
  end

  def schedule(campaign, scheduled_at)
    campaign.status = :scheduled
    campaign.scheduled_at = scheduled_at
    campaign.run_token = campaign.new_run_token
  end

  def enqueue_scheduled_launch(campaign)
    Outreach::ScheduledLaunchJob
      .set(wait_until: campaign.scheduled_at)
      .perform_later(campaign.id.to_s, campaign.organization_id, campaign.run_token)

    campaign.log_activity!(
      "scheduled",
      account_id: current_account.id,
      metadata: { "scheduled_at" => Outreach::CampaignSerializer.epoch_ms(campaign.scheduled_at), "timezone" => campaign.timezone }
    )
  end
end
