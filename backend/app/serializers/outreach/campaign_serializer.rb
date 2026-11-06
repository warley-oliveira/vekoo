module Outreach
  class CampaignSerializer < ApplicationSerializer
    def self.one(campaign)
      {
        id: campaign.id.to_s,
        name: campaign.name,
        status: campaign.status_cd,
        pauseReason: campaign.pause_reason,
        messageType: campaign.message_type_cd,
        campaignMode: campaign.campaign_mode_cd,
        attachmentId: campaign.attachment_id,
        mediaUrl: campaign.media_url,
        mediaContentType: campaign.media_content_type,
        mediaFileName: campaign.media_file_name,
        totalContacts: campaign.total_recipients,
        sentCount: campaign.sent_count,
        deliveredCount: campaign.delivered_count,
        readCount: campaign.read_count,
        failedCount: campaign.failed_count,
        connectorIds: campaign.connector_ids,
        wabaConnectorId: campaign.waba_connector_id,
        phoneNumberIds: campaign.phone_number_ids,
        templateIds: campaign.template_ids,
        # As chaves são ids de modelo e posições: saem como estão.
        templateParams: campaign.template_params,
        flowId: campaign.flow_id,
        chatTagIds: campaign.chat_tag_ids,
        raiseChats: campaign.raise_chats,
        sendWindowStart: format_hour(campaign.send_start_hour),
        sendWindowEnd: format_hour(campaign.send_end_hour),
        sendDays: campaign.send_days,
        intervalMin: campaign.buffer_min_seconds,
        intervalMax: campaign.buffer_max_seconds,
        dailyLimitPerConnector: campaign.daily_limit_per_connector,
        timezone: campaign.timezone,
        scheduledAt: epoch_ms(campaign.scheduled_at),
        startedAt: epoch_ms(campaign.started_at),
        completedAt: epoch_ms(campaign.completed_at),
        estimatedCompletionAt: epoch_ms(campaign.estimated_completion_at),
        createdAt: epoch_ms(campaign.created_at),
        updatedAt: epoch_ms(campaign.updated_at)
      }
    end

    def self.detail(campaign)
      logs = campaign.activity_logs.order_by(created_at: :desc).limit(Campaign::ACTIVITY_LOG_LIMIT)

      one(campaign).merge(
        messages: campaign.messages,
        batchSize: campaign.batch_size,
        createdByAccountId: campaign.created_by_account_id,
        activityEvents: ActivityLogSerializer.many(logs)
      )
    end

    def self.format_hour(hour)
      hour.nil? ? nil : format("%02d:00", hour)
    end
    private_class_method :format_hour
  end
end
