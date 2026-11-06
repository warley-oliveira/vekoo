# Badges de alerta do menu em tempo real, por organização.
#
#   { channel: "OrganizationAlertsChannel" }
#
# A organização vem da sessão. Ao assinar e a cada mudança, transmite:
#
#   { badges: { "connectors" => 2, "webhooks" => 1 } }
class OrganizationAlertsChannel < ApplicationCable::Channel
  STREAM = "alerts".freeze

  def subscribed
    stream_from organization_stream(STREAM)
    transmit(self.class.payload_for(current_organization))
  end

  def unsubscribed
    stop_all_streams
  end

  def self.broadcast_state(organization)
    ActionCable.server.broadcast(organization_stream(organization.id, STREAM), payload_for(organization))
  end

  def self.payload_for(organization)
    { badges: OrganizationAlert.active_counts_by_category(organization) }
  end
end
