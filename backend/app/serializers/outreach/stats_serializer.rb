module Outreach
  # Os números do monitor. Só com o que está na campanha: sai a cada mensagem enviada.
  class StatsSerializer < ApplicationSerializer
    MINIMUM_ELAPSED_HOURS = 0.01

    def self.one(campaign)
      sent = campaign.sent_count
      delivered = campaign.delivered_count

      {
        totalContacts: campaign.total_recipients,
        sent: sent,
        delivered: delivered,
        read: campaign.read_count,
        failed: campaign.failed_count,
        deliveryRate: rate(delivered, sent),
        openRate: rate(campaign.read_count, delivered),
        messagesPerHour: messages_per_hour(campaign),
        estimatedCompletion: epoch_ms(campaign.estimated_completion_at)
      }
    end

    # Para a resposta de GET /stats, que pode pagar duas consultas pelo que falta.
    def self.detail(campaign)
      one(campaign).merge(
        pending: campaign.recipients.unsent.count,
        skipped: campaign.recipients.status_skipped.count
      )
    end

    def self.rate(part, whole)
      whole.positive? ? (part.to_f / whole).round(4) : 0.0
    end
    private_class_method :rate

    def self.messages_per_hour(campaign)
      return 0.0 if campaign.started_at.blank? || campaign.sent_count.zero?

      elapsed = [ (Time.current - campaign.started_at) / 3600.0, MINIMUM_ELAPSED_HOURS ].max
      (campaign.sent_count / elapsed).round(1)
    end
    private_class_method :messages_per_hour
  end
end
