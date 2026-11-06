module Outreach
  # O que o monitor recebe em tempo real, por `CampaignChannel`.
  #
  # Melhor esforço: o aviso é detalhe, o envio é o trabalho. Um soluço no Redis não pode fazer uma
  # mensagem já enviada parecer falha, e quem perdeu o aviso lê o estado em GET /campaigns/:id/stats.
  module MonitorEvents
    module_function

    # Contadores novos. Vai também para a lista de campanhas.
    def progress(campaign)
      fresh = Campaign.where(_id: campaign.id).take
      return unless fresh

      publish(fresh, { event: "progress", campaignId: fresh.id.to_s, status: fresh.status_cd, stats: StatsSerializer.one(fresh) }, list: true)
    end

    # Mudou de estado. Vai também para a lista de campanhas.
    def status(campaign)
      publish(campaign, { event: "status", campaignId: campaign.id.to_s, campaign: CampaignSerializer.one(campaign) }, list: true)
    end

    def recipient(campaign, recipient)
      publish(campaign, { event: "recipient", campaignId: campaign.id.to_s, recipient: RecipientSerializer.one(recipient) })
    end

    def activity(campaign, log)
      publish(campaign, { event: "activity", campaignId: campaign.id.to_s, activity: ActivityLogSerializer.one(log) })
    end

    def publish(campaign, payload, list: false)
      CampaignChannel.broadcast_event(campaign.organization_id, campaign.id, payload, list: list)
    rescue StandardError => e
      Rails.logger.warn("[Outreach::MonitorEvents] transmissão perdida (#{payload[:event]}): #{e.class}: #{e.message}")
    end
    private_class_method :publish
  end
end
