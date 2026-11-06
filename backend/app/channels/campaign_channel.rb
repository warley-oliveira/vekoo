# Monitoramento em tempo real das campanhas. Exige a permissão `campaigns`.
#
#   { campaignId: "..." }  o monitor de uma campanha: progress, status, recipient e activity.
#   sem parâmetro          a lista de campanhas da organização: só progress e status.
#
# SOMENTE LEITURA: lançar, pausar e o resto são ações da API, com a resposta de erro dela. Ao
# reconectar, a tela relê `GET /campaigns/:id/stats`: evento perdido não volta.
class CampaignChannel < ApplicationCable::Channel
  LIST_STREAM = "campaigns".freeze

  def self.stream_for_campaign(campaign_id)
    "campaign:#{campaign_id}"
  end

  def self.broadcast_event(organization_id, campaign_id, payload, list: false)
    ActionCable.server.broadcast(organization_stream(organization_id, stream_for_campaign(campaign_id)), payload)
    ActionCable.server.broadcast(organization_stream(organization_id, LIST_STREAM), payload) if list
  end

  def subscribed
    return reject unless current_account.can?(:campaigns)

    campaign_id = params[:campaignId] || params[:campaign_id]
    return stream_from(organization_stream(LIST_STREAM)) if campaign_id.blank?

    # De outra organização, é como se não existisse.
    campaign = Outreach::Campaign.scoped(current_organization.id, campaign_id)
    return reject unless campaign

    stream_from organization_stream(self.class.stream_for_campaign(campaign.id))
  end

  def unsubscribed
    stop_all_streams
  end
end
