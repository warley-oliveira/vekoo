# O que o assistente de criação de campanha oferece.
class CampaignOptionsController < PlatformController
  require_permission :campaigns

  # GET /campaigns/capabilities: o que depende de chave externa.
  def capabilities
    render json: { capabilities: Outreach::Capabilities.as_json }
  end

  # GET /campaigns/available-connectors
  def connectors
    records = current_organization.connectors.where(:_type.in => Outreach::Campaign::SENDABLE_CONNECTORS)
    render json: { connectors: ConnectorSerializer.many(records) }
  end

  # GET /campaigns/available-tags
  def tags
    render json: { tags: ChatTagSerializer.many(current_organization.chat_tags.order_by(name: :asc)) }
  end

  # GET /campaigns/available-flows: quem pode responder a quem receber a campanha.
  def flows
    render json: { flows: Outreach::AvailableFlows.for(current_organization) }
  end
end
