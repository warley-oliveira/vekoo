module Outreach
  # Lança uma campanha em rascunho ou agendada. Origem: Campaigns::LaunchService.
  class LaunchService
    Result = Struct.new(:warnings, :estimated_completion_at, keyword_init: true)

    # @param account_id [String, nil] quem lançou. Na agendada, quem criou.
    def initialize(campaign, account_id: nil)
      @campaign = campaign
      @account_id = account_id
    end

    # @raise [RefusedError]
    # @return [Result]
    def call
      validate!
      channels = available_channels

      # Antes de montar os lotes: dois cliques em "Lançar" não montam dois planos.
      started = campaign.transition!(
        from: %i[draft scheduled],
        to: :running,
        run_token: campaign.new_run_token,
        started_at: Time.current,
        planned_at: Time.current,
        pause_reason: nil
      )
      raise RefusedError, "campaignNotLaunchable" unless started

      planned = Planner.new(campaign, channels.active).call
      campaign.log_activity!("launched", account_id: account_id, metadata: launch_metadata(channels))
      MonitorEvents.status(campaign)
      Settlement.new(campaign).call if planned.zero?

      Result.new(warnings: warnings_for(channels), estimated_completion_at: campaign.reload.estimated_completion_at)
    end

    # O que precisa estar pronto para lançar. Agendar confere o mesmo: é melhor recusar agora do que a
    # pessoa descobrir no horário marcado.
    #
    # @raise [RefusedError]
    def check!
      validate!
      available_channels
      true
    end

    private

    attr_reader :campaign, :account_id

    def validate!
      raise RefusedError, "campaignNotLaunchable" unless campaign.draft? || campaign.scheduled?
      raise RefusedError, "noRecipients" unless campaign.recipients.exists?

      campaign.template_mode? ? validate_template_mode! : validate_text_mode!
    end

    def validate_template_mode!
      raise RefusedError.new("wabaRequired", field: "wabaConnectorId") if campaign.waba_connector_id.blank?
      raise RefusedError.new("phoneNumbersRequired", field: "phoneNumberIds") if campaign.normalized_phone_number_ids.blank?
      raise RefusedError.new("templatesRequired", field: "templateIds") if campaign.template_ids.blank?
    end

    def validate_text_mode!
      raise RefusedError.new("connectorsRequired", field: "connectorIds") if campaign.connector_ids.blank?

      if campaign.media_message?
        raise RefusedError.new("mediaRequired", field: "attachmentId") if campaign.attachment_id.blank?
      elsif campaign.effective_messages.empty?
        raise RefusedError.new("messagesRequired", field: "messages")
      end
    end

    def available_channels
      channels = Channels.for(campaign)
      return channels if channels.active.any?

      if campaign.template_mode?
        raise RefusedError.new(campaign.waba_connector ? "wabaDisconnected" : "wabaNotFound", field: "wabaConnectorId")
      end

      raise RefusedError.new("connectorsDisconnected", field: "connectorIds")
    end

    def launch_metadata(channels)
      return {} if channels.disconnected.empty?

      { "skipped_connector_ids" => channels.disconnected.map { |connector| connector.id.to_s } }
    end

    def warnings_for(channels)
      return [] if channels.disconnected.empty?

      [ {
        code: "connectorsSkipped",
        connectorIds: channels.disconnected.map { |connector| connector.id.to_s },
        message: I18n.t("outreach.warnings.connectors_skipped", names: channels.disconnected.map(&:display_name).join(", "))
      } ]
    end
  end
end
