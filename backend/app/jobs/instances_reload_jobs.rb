# Recarrega as instâncias de WhatsApp Web ativas. Agendado em config/schedule/connectors.yml,
# desligado por padrão como na origem.
class InstancesReloadJobs < ApplicationJob
  queue_as :low

  def perform
    Connector::WhatsappWeb.where(status_cd: "active").each do |connector|
      connector.reload_instance
    rescue StandardError => e
      Rails.logger.error(e.full_message)
    end
  end
end
